<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\Student;
use App\Models\Teacher;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * HELPER METHOD: រៀបចំទម្រង់ទិន្នន័យ User, Teacher និង Student ឱ្យពេញលេញតាំងពីវិនាទីដំបូង
     */
    private function buildUserAndTeacherPayload(User $user)
    {
        $user->loadMissing('role:id,role_name');

        $userData = [
            'id' => $user->id,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email,
            'phone' => $user->phone,
            'gender' => $user->gender,
            'status' => $user->status,
            'role_id' => $user->role_id,
            'role' => $user->role,
            'profile_image' => $user->profile_image,
            'telegram_linked' => $this->resolveUserTelegramChatId($user) !== null,
            'created_at' => $user->created_at,
            'updated_at' => $user->updated_at,
        ];

        $teacherData = null;
        $roleNameLower = strtolower((string) ($user->role?->role_name ?? ''));
        $isTeacherRole = $roleNameLower === 'teacher' || (int) $user->role_id === 2;
        $isStudentRole = $roleNameLower === 'student' || (int) $user->role_id === 3;

        if ($isTeacherRole) {
            $teacher = Teacher::with([
                'department:id,department_name',
                'role:id,role_name',
            ])
                ->select([
                    'id', 'user_id', 'role_id', 'department_id',
                    'teacher_code', 'first_name', 'last_name', 'gender',
                    'date_of_birth', 'email', 'phone', 'profile_image',
                    'specialization', 'employment_type',
                ])
                ->where('user_id', $user->id)
                ->first();

            if ($teacher) {
                if (empty($teacher->profile_image) && !empty($user->profile_image)) {
                    $teacher->profile_image = $user->profile_image;
                } elseif (empty($userData['profile_image']) && !empty($teacher->profile_image)) {
                    $userData['profile_image'] = $teacher->profile_image;
                }

                $userData['teacher_id'] = $teacher->id;
                $userData['teacher_code'] = $teacher->teacher_code;
                $userData['specialization'] = $teacher->specialization;
                $userData['department_id'] = $teacher->department_id;
                $userData['department_name'] = $teacher->department?->department_name;
                $userData['department'] = $teacher->department;
                $userData['employment_type'] = $teacher->employment_type;
                $userData['date_of_birth'] = $teacher->date_of_birth;
                $userData['teacher_first_name'] = $teacher->first_name;
                $userData['teacher_last_name'] = $teacher->last_name;
                $userData['teacher_email'] = $teacher->email;
                $userData['teacher_phone'] = $teacher->phone;
                $userData['teacher_gender'] = $teacher->gender;
                $userData['teacher_role'] = $teacher->role;
                $userData['teacher'] = $teacher;
                $userData['is_teacher'] = true;

                $teacherData = $teacher;
            } else {
                $userData['is_teacher'] = false;
            }
        } elseif ($isStudentRole) {
            $userData['is_teacher'] = false;

            $student = Student::with([
                'department:id,department_name',
                'role:id,role_name',
            ])
                ->select([
                    'id', 'user_id', 'role_id', 'department_id',
                    'student_code', 'first_name', 'last_name', 'gender',
                    'date_of_birth', 'email', 'phone', 'profile_image',
                    'batch_year', 'degree_level', 'study_shift', 'address',
                ])
                ->where('user_id', $user->id)
                ->first();

            if ($student) {
                if (empty($student->profile_image) && !empty($user->profile_image)) {
                    $student->profile_image = $user->profile_image;
                } elseif (empty($userData['profile_image']) && !empty($student->profile_image)) {
                    $userData['profile_image'] = $student->profile_image;
                }

                $userData['student_id'] = $student->id;
                $userData['student_code'] = $student->student_code;
                $userData['department_id'] = $student->department_id;
                $userData['department_name'] = $student->department?->department_name;
                $userData['department'] = $student->department;
                $userData['batch_year'] = $student->batch_year;
                $userData['degree_level'] = $student->degree_level;
                $userData['study_shift'] = $student->study_shift ?? 'Monday-Friday';
                $userData['date_of_birth'] = $student->date_of_birth;
                $userData['student'] = $student;
            }
        } else {
            $userData['is_teacher'] = false;
        }

        return [$userData, $teacherData];
    }

    /**
     * HELPER METHOD: បង្កើតលេខសម្គាល់ឧបករណ៍ (Device Fingerprint)
     */
    private function getDeviceFingerprint(Request $request)
    {
        $ua = strtolower(trim((string) $request->userAgent()));
        $ip = (string) $request->ip();
        return md5($ua . '|' . $ip);
    }

    /**
     * ✅ HELPER METHOD: កំណត់យក Telegram Chat ID ផ្ទាល់ខ្លួនរបស់អ្នកប្រើប្រាស់ម្នាក់ៗ
     */
    private function resolveUserTelegramChatId(User $user): ?string
    {
        if (!empty($user->telegram_chat_id)) {
            return trim((string) $user->telegram_chat_id);
        }

        $cachedChatId = Cache::get('lms_user_telegram_chat_id_' . $user->id);
        if (!empty($cachedChatId)) {
            return trim((string) $cachedChatId);
        }

        return null;
    }

    /**
     * HELPER METHOD: រក្សាទុក Telegram Chat ID របស់អ្នកប្រើប្រាស់ដោយស្វ័យប្រវត្តិ
     */
    private function saveUserTelegramChatId(User $user, string $chatId): void
    {
        $cleanChatId = trim($chatId);
        Cache::forever('lms_user_telegram_chat_id_' . $user->id, $cleanChatId);

        try {
            if (Schema::hasColumn('users', 'telegram_chat_id')) {
                $user->forceFill(['telegram_chat_id' => $cleanChatId])->save();
            }
        } catch (\Exception $e) {
            Log::warning('Could not save telegram_chat_id to users table: ' . $e->getMessage());
        }
    }

    /**
     * ✅ HELPER METHOD: ផ្ដាច់ (លុប) Telegram Chat ID របស់អ្នកប្រើប្រាស់ចេញពីប្រព័ន្ធ (ដើម្បីឱ្យលេខកូដ ៦ ខ្ទង់ត្រឡប់ទៅផ្ញើចូល Email វិញ)
     */
    private function unlinkUserTelegramChatId(User $user): void
    {
        $existingToken = Cache::get('lms_tg_user_link_token_' . $user->id);
        if ($existingToken) {
            Cache::forget('lms_tg_link_token_map_' . $existingToken);
        }

        Cache::forget('lms_user_telegram_chat_id_' . $user->id);
        Cache::forget('lms_tg_user_link_token_' . $user->id);

        try {
            if (Schema::hasColumn('users', 'telegram_chat_id')) {
                $user->forceFill(['telegram_chat_id' => null])->save();
            }
        } catch (\Exception $e) {
            Log::warning('Could not clear telegram_chat_id from users table: ' . $e->getMessage());
        }
    }

    /**
     * HELPER METHOD: ទាញយក Username របស់ Telegram Bot ដោយស្វ័យប្រវត្តិពី TELEGRAM_BOT_TOKEN
     */
    private function resolveTelegramBotUsername(): ?string
    {
        $envUsername = env('TELEGRAM_BOT_USERNAME');
        if (!empty($envUsername)) {
            return ltrim(trim((string) $envUsername), '@');
        }

        $botToken = env('TELEGRAM_BOT_TOKEN');
        if (empty($botToken)) {
            return null;
        }

        return Cache::remember('lms_telegram_bot_username_' . md5($botToken), now()->addHours(24), function () use ($botToken) {
            try {
                $res = Http::timeout(4)->get("https://api.telegram.org/bot{$botToken}/getMe");
                if ($res->successful() && !empty($res->json('result.username'))) {
                    return $res->json('result.username');
                }
            } catch (\Exception $e) {
                Log::warning('Telegram getMe failed: ' . $e->getMessage());
            }
            return null;
        });
    }

    /**
     * ✅ HELPER METHOD: បង្កើតតំណភ្ជាប់ Telegram Deep-Link សម្រាប់ឱ្យអ្នកប្រើចុចភ្ជាប់ Telegram ក្នុង ១ ចុច
     */
    private function generateTelegramLinkUrl(User $user, bool $forceNewToken = false): ?string
    {
        $botUsername = $this->resolveTelegramBotUsername();
        if (!$botUsername) {
            return null;
        }

        $tokenKey = 'lms_tg_user_link_token_' . $user->id;
        $token = $forceNewToken ? null : Cache::get($tokenKey);

        if (!$token) {
            $token = $user->id . '_' . Str::lower(Str::random(10));
            Cache::put($tokenKey, $token, now()->addMinutes(30));
        }
        Cache::put('lms_tg_link_token_map_' . $token, $user->id, now()->addMinutes(30));

        return "https://t.me/{$botUsername}?start=link_{$token}";
    }

    /**
     * ✅ HELPER METHOD: ផ្ញើលេខកូដ 2FA ឬលេខកូដកំណត់ពាក្យសម្ងាត់ឡើងវិញ (៦ ខ្ទង់) ទៅកាន់ Telegram Bot (ទម្រង់ផ្លូវការ)
     */
    private function sendTelegramOtpAlert(User $user, string $otp, Request $request, string $purpose = '2fa'): bool
    {
        $botToken = env('TELEGRAM_BOT_TOKEN');
        $chatId = $this->resolveUserTelegramChatId($user);

        if (!$botToken || !$chatId) {
            return false;
        }

        $fullName = htmlspecialchars(trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')) ?: 'អ្នកប្រើប្រាស់', ENT_QUOTES, 'UTF-8');
        $rawRole = $user->role?->role_name ?? 'User';

        $roleKh = match (strtolower($rawRole)) {
            'admin' => 'អ្នកគ្រប់គ្រងប្រព័ន្ធ (Admin)',
            'teacher' => 'គ្រូបច្ចេកទេស (Teacher)',
            'student' => 'សិក្ខាកាម/និស្សិត (Student)',
            default => htmlspecialchars($rawRole, ENT_QUOTES, 'UTF-8'),
        };

        $email = htmlspecialchars((string) $user->email, ENT_QUOTES, 'UTF-8');
        $ip = htmlspecialchars((string) ($request->ip() ?? 'Unknown IP'), ENT_QUOTES, 'UTF-8');
        $time = now()->format('d-m-Y H:i:s');

        $purposeTitle = $purpose === 'reset'
            ? "🔐 <b>សំណើកំណត់ពាក្យសម្ងាត់ឡើងវិញ (Password Reset)</b>"
            : "📌 <b>ការផ្ទៀងផ្ទាត់សុវត្ថិភាពចូលប្រព័ន្ធ (2FA)</b>";

        $text = "🏛️ <b>វិទ្យាស្ថានពហុបច្ចេកទេសភូមិភាគតេជោសែនស្វាយរៀង</b>\n"
              . "🛡️ <b>ប្រព័ន្ធគ្រប់គ្រងការសិក្សាតាមអនឡាញ (RPITSSVR LMS)</b>\n"
              . "━━━━━━━━━━━━━━━━━━\n"
              . "{$purposeTitle}\n\n"
              . "👤 <b>គណនី៖</b> {$fullName} ({$roleKh})\n"
              . "📧 <b>អ៊ីមែល៖</b> <code>{$email}</code>\n\n"
              . "🔑 <b>លេខកូដផ្ទៀងផ្ទាត់ ៦ ខ្ទង់៖</b>\n"
              . "👉 <code>{$otp}</code>  <i>(ចុចលើលេខកូដដើម្បីចម្លង)</i>\n\n"
              . "⏳ <b>សុពលភាព៖</b> ៥ នាទី\n"
              . "🌐 <b>អាសយដ្ឋាន IP៖</b> <code>{$ip}</code>\n"
              . "🕒 <b>កាលបរិច្ឆេទ៖</b> <code>{$time}</code>\n"
              . "━━━━━━━━━━━━━━━━━━\n"
              . "⚠️ <i>សម្គាល់៖ សូមរក្សាលេខកូដនេះជាសម្ងាត់ និងកុំប្រាប់ទៅអ្នកដទៃដាច់ខាត!</i>";

        try {
            $response = Http::timeout(4)->post("https://api.telegram.org/bot{$botToken}/sendMessage", [
                'chat_id' => $chatId,
                'text' => $text,
                'parse_mode' => 'HTML',
            ]);

            return $response->successful();
        } catch (\Exception $e) {
            Log::warning('Telegram OTP send failed for ' . $user->email . ': ' . $e->getMessage());
            return false;
        }
    }

    /**
     * ✅ HELPER METHOD: បង្កើត និងផ្ញើលេខកូដ ៦ ខ្ទង់ដោយរហ័ស៖
     * - បើភ្ជាប់ Telegram ហើយ -> ផ្ញើទៅ Telegram ភ្លាម (មិនបាច់រង់ចាំ Email នាំឱ្យយឺតពេល Login ទេ)
     * - បើមិនទាន់ភ្ជាប់ Telegram (ឬបានផ្ដាច់ Telegram ហើយ) -> ទើបផ្ញើទៅកាន់ Email
     */
    private function generateAndSendOtp(User $user, Request $request, string $purpose = '2fa'): array
    {
        $otp = (string) random_int(100000, 999999);
        $prefix = $purpose === 'reset' ? 'lms_pwd_reset_otp_' : 'lms_2fa_otp_';
        $attemptPrefix = $purpose === 'reset' ? 'lms_pwd_reset_attempts_' : 'lms_2fa_attempts_';

        $cacheKey = $prefix . $user->id;
        $attemptKey = $attemptPrefix . $user->id;

        Cache::put($cacheKey, $otp, now()->addMinutes(5));
        Cache::forget($attemptKey);

        $fullName = htmlspecialchars(trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')) ?: 'អ្នកប្រើប្រាស់', ENT_QUOTES, 'UTF-8');
        $rawRole = $user->role?->role_name ?? 'User';

        $roleKh = match (strtolower($rawRole)) {
            'admin' => 'អ្នកគ្រប់គ្រងប្រព័ន្ធ (Admin)',
            'teacher' => 'គ្រូបច្ចេកទេស (Teacher)',
            'student' => 'សិក្ខាកាម/និស្សិត (Student)',
            default => htmlspecialchars($rawRole, ENT_QUOTES, 'UTF-8'),
        };

        $safeEmail = htmlspecialchars((string) $user->email, ENT_QUOTES, 'UTF-8');
        $ipAddress = htmlspecialchars((string) ($request->ip() ?? 'Unknown IP'), ENT_QUOTES, 'UTF-8');
        $userAgent = htmlspecialchars(substr((string) $request->userAgent(), 0, 120) ?: 'Unknown Device', ENT_QUOTES, 'UTF-8');
        $timeNow = now()->format('d-m-Y H:i:s');
        $yearNow = now()->format('Y');

        $telegramSent = false;
        $mailSent = false;
        $mailErrorMsg = null;
        $deliveryChannel = 'none';

        $isTelegramLinked = $this->resolveUserTelegramChatId($user) !== null;

        // ✅ ១. ប្រសិនបើអ្នកប្រើប្រាស់បានភ្ជាប់ Telegram រួចហើយ គឺផ្ញើទៅកាន់ Telegram ភ្លាម (រហ័សបំផុត < 0.5s)
        if ($isTelegramLinked) {
            $telegramSent = $this->sendTelegramOtpAlert($user, $otp, $request, $purpose);
            if ($telegramSent) {
                $deliveryChannel = 'telegram';
                Log::info("6-Digit OTP ({$purpose}) for [{$user->email}] ({$rawRole}) via [telegram]: {$otp}");

                return [
                    'otp' => null,
                    'mail_sent' => false,
                    'mail_error' => null,
                    'telegram_sent' => true,
                    'telegram_linked' => true,
                    'telegram_link_url' => null,
                    'delivery_channel' => 'telegram',
                ];
            }
        }

        // ✅ ២. លុះត្រាតែមិនទាន់ភ្ជាប់ Telegram (ឬបានផ្ដាច់ Telegram ហើយ) ទើបរៀបចំផ្ញើទៅកាន់ Email
        $badgeTitle = $purpose === 'reset'
            ? '🔐 សំណើកំណត់ពាក្យសម្ងាត់ឡើងវិញ'
            : '🛡️ ការផ្ទៀងផ្ទាត់សុវត្ថិភាពចូលប្រព័ន្ធ (2FA)';

        $purposeDescription = $purpose === 'reset'
            ? 'យើងខ្ញុំបានទទួលសំណើសុំផ្លាស់ប្ដូរពាក្យសម្ងាត់ថ្មីសម្រាប់គណនីរបស់អ្នក។ សូមប្រើប្រាស់លេខកូដផ្ទៀងផ្ទាត់ ៦ ខ្ទង់ខាងក្រោមនេះដើម្បីកំណត់ពាក្យសម្ងាត់ថ្មី៖'
            : 'ដើម្បីធានាសុវត្ថិភាពគណនីសិក្សារបស់អ្នក សូមបញ្ចូលលេខកូដផ្ទៀងផ្ទាត់ ៦ ខ្ទង់ខាងក្រោមនេះ ទៅក្នុងផ្ទាំងចូលប្រព័ន្ធ (Login)៖';

        $subjectTitle = $purpose === 'reset'
            ? 'RPITSSVR LMS - កំណត់ពាក្យសម្ងាត់ឡើងវិញ'
            : 'RPITSSVR LMS - លេខកូដផ្ទៀងផ្ទាត់សុវត្ថិភាព';

        $frontendBase = rtrim((string) env('FRONTEND_URL', 'https://lmsrpitssvr.site'), '/');
        if (str_contains($frontendBase, 'localhost') || str_contains($frontendBase, '127.0.0.1')) {
            $frontendBase = 'https://lmsrpitssvr.site';
        }
        $logoUrl = htmlspecialchars(
            trim((string) env('MAIL_LOGO_URL', $frontendBase . '/PRIT.png')),
            ENT_QUOTES,
            'UTF-8'
        );

        $formattedOtp = implode(' ', str_split($otp));

        $htmlContent = "
        <!DOCTYPE html>
        <html lang='km'>
        <head>
            <meta charset='UTF-8'>
            <meta name='viewport' content='width=device-width, initial-scale=1.0'>
        </head>
        <body style='margin: 0; padding: 16px 10px; background-color: #f1f5f9; font-family: \"Kantumruy Pro\", \"Battambang\", \"Khmer OS Siemreap\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Arial, sans-serif; color: #1e293b;'>
            <div style='max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);'>
                
                <!-- ក្បាលសំបុត្រផ្លូវការរបស់វិទ្យាស្ថាន -->
                <div style='background: linear-gradient(135deg, #1e3a8a 0%, #312e81 55%, #4338ca 100%); padding: 26px 18px; text-align: center; border-bottom: 4px solid #f59e0b;'>
                    <div style='margin: 0 auto 12px auto; width: 72px; height: 72px; background-color: #ffffff; border-radius: 18px; padding: 6px; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25); border: 2px solid rgba(253, 224, 71, 0.65);'>
                        <img src='{$logoUrl}' alt='RPITSSVR Logo' width='60' height='60' style='width: 60px; height: 60px; object-fit: contain; display: block; margin: 0 auto; border: 0;' />
                    </div>

                    <div style='display: inline-block; padding: 5px 14px; background-color: rgba(255, 255, 255, 0.14); border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 999px; color: #fde047; font-size: 11.5px; font-weight: bold; margin-bottom: 10px;'>
                        ប្រព័ន្ធគ្រប់គ្រងការសិក្សាតាមអនឡាញ • RPITSSVR LMS
                    </div>
                    <div style='margin: 0; color: #ffffff; font-size: 17px; font-weight: 800; line-height: 1.65;'>
                        <div style='white-space: nowrap;'>វិទ្យាស្ថានពហុបច្ចេកទេស</div>
                        <div style='color: #fde047; white-space: nowrap;'>ភូមិភាគតេជោសែនស្វាយរៀង</div>
                    </div>
                    <p style='margin: 6px 0 0 0; color: #c7d2fe; font-size: 11px; font-weight: 600; letter-spacing: 0.3px;'>
                        Regional Polytechnic Institute Techo Sen Svay Rieng
                    </p>
                </div>

                <!-- ខ្លឹមសារសំបុត្រ -->
                <div style='padding: 24px 20px;'>
                    <div style='margin-bottom: 16px; padding: 9px 14px; background-color: #eef2ff; border-left: 4px solid #4f46e5; border-radius: 8px; color: #312e81; font-size: 13px; font-weight: bold;'>
                        {$badgeTitle}
                    </div>

                    <p style='margin: 0 0 10px 0; font-size: 14.5px; color: #0f172a; line-height: 1.6;'>
                        គោរពជូន <strong>{$fullName}</strong> <span style='color: #4f46e5; font-size: 12.5px; font-weight: bold;'>({$roleKh})</span>,
                    </p>

                    <p style='margin: 0 0 20px 0; font-size: 13.5px; color: #475569; line-height: 1.7;'>
                        {$purposeDescription}
                    </p>

                    <!-- ប្រអប់លេខកូដ ៦ ខ្ទង់ -->
                    <div style='margin: 22px 0; padding: 24px 14px; background: linear-gradient(145deg, #0f172a 0%, #1e1b4b 100%); border: 2px solid #4f46e5; border-radius: 20px; text-align: center; box-shadow: 0 10px 25px rgba(49, 46, 129, 0.2);'>
                        <div style='font-size: 12px; font-weight: bold; color: #cbd5e1; margin-bottom: 14px;'>
                            🔑 លេខកូដផ្ទៀងផ្ទាត់ ៦ ខ្ទង់របស់អ្នកគឺ៖
                        </div>
                        <div style='display: inline-block; background-color: rgba(255, 255, 255, 0.08); border: 1px solid rgba(253, 224, 71, 0.4); border-radius: 14px; padding: 12px 22px; margin-bottom: 14px;'>
                            <span style='font-size: 28px; font-weight: 900; letter-spacing: 4px; color: #fde047; font-family: \"Courier New\", Courier, monospace; white-space: nowrap; display: inline-block; line-height: 1.2;'>
                                {$formattedOtp}
                            </span>
                        </div>
                        <div style='font-size: 12px; color: #38bdf8; font-weight: bold;'>
                            ⏳ សុពលភាពប្រើប្រាស់៖ ៥ នាទី
                        </div>
                    </div>

                    <!-- តារាងព័ត៌មានលម្អិតនៃការចូលប្រព័ន្ធ -->
                    <div style='background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; margin-bottom: 18px; font-size: 12px; color: #334155; line-height: 1.85;'>
                        <div style='font-weight: bold; color: #0f172a; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;'>
                            📋 ព័ត៌មានលម្អិតនៃការស្នើសុំ៖
                        </div>
                        <div><strong>📧 អ៊ីមែលគណនី៖</strong> {$safeEmail}</div>
                        <div><strong>🕒 កាលបរិច្ឆេទ និងម៉ោង៖</strong> {$timeNow}</div>
                        <div><strong>🌐 អាសយដ្ឋាន IP៖</strong> {$ipAddress}</div>
                        <div><strong>💻 ឧបករណ៍៖</strong> {$userAgent}</div>
                    </div>

                    <!-- សារព្រមានសុវត្ថិភាព -->
                    <div style='padding: 12px 14px; background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 12px; color: #be123c; font-size: 11.5px; font-weight: bold; line-height: 1.6;'>
                        ⚠️ សម្គាល់សុវត្ថិភាព៖ ប្រសិនបើអ្នកមិនបានធ្វើការស្នើសុំនេះទេ សូមរក្សាលេខកូដនេះជាសម្ងាត់ និងកុំប្រាប់ទៅអ្នកដទៃដាច់ខាត!
                    </div>
                </div>

                <!-- ផ្នែកខាងក្រោម (Footer) -->
                <div style='background-color: #0f172a; padding: 18px 16px; text-align: center; color: #94a3b8; font-size: 11px; line-height: 1.65;'>
                    <div style='color: #fde047; font-weight: bold; margin-bottom: 4px;'>
                        «TVET ជំនាញពិត ជីវិតប្រសើរ! រៀនឱ្យចប់ ឱ្យចេះ ឱ្យមានការងារ»
                    </div>
                    <div>
                        &copy; {$yearNow} វិទ្យាស្ថានពហុបច្ចេកទេសភូមិភាគតេជោសែនស្វាយរៀង (RPITSSVR)
                    </div>
                </div>

            </div>
        </body>
        </html>
        ";

        $smtpUsername = trim((string) env('MAIL_USERNAME', 'kavicheka7@gmail.com'));
        $smtpPassword = str_replace(' ', '', trim((string) env('MAIL_PASSWORD', 'cdezkfuqvznodtsp')));
        $smtpFromAddress = trim((string) env('MAIL_FROM_ADDRESS', $smtpUsername));
        $smtpFromName = trim((string) env('MAIL_FROM_NAME', 'RPITSSVR LMS'));

        $googleScriptUrl = trim((string) env('GOOGLE_SCRIPT_MAIL_URL', ''));
        $brevoApiKey = trim((string) env('BREVO_API_KEY', ''));

        // ២.១. ផ្ញើតាមរយៈ Google Apps Script HTTPS (Port 443)
        if (!$mailSent && !empty($googleScriptUrl)) {
            try {
                $res = Http::timeout(6)
                    ->withOptions(['allow_redirects' => true])
                    ->post($googleScriptUrl, [
                        'to' => trim($user->email),
                        'subject' => $subjectTitle,
                        'html' => $htmlContent,
                        'from_name' => $smtpFromName,
                    ]);

                if ($res->successful()) {
                    $mailSent = true;
                } else {
                    $mailErrorMsg = 'Google Script HTTP ' . $res->status();
                }
            } catch (\Exception $e) {
                $mailErrorMsg = $e->getMessage();
                Log::warning('Google Script Mail Error: ' . $mailErrorMsg);
            }
        }

        // ២.២. ឬផ្ញើតាមរយៈ Brevo HTTP API (Port 443)
        if (!$mailSent && !empty($brevoApiKey)) {
            try {
                $recipientName = trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')) ?: 'User';
                $res = Http::timeout(6)->withHeaders([
                    'api-key' => $brevoApiKey,
                    'accept' => 'application/json',
                    'content-type' => 'application/json',
                ])->post('https://api.brevo.com/v3/smtp/email', [
                    'sender' => [
                        'name' => $smtpFromName,
                        'email' => $smtpFromAddress,
                    ],
                    'to' => [
                        [
                            'email' => trim($user->email),
                            'name' => $recipientName,
                        ],
                    ],
                    'subject' => $subjectTitle,
                    'htmlContent' => $htmlContent,
                ]);

                if ($res->successful()) {
                    $mailSent = true;
                } else {
                    $mailErrorMsg = 'Brevo API (' . $res->status() . '): ' . $res->body();
                    Log::error('Brevo API Send Error for ' . $user->email . ': ' . $mailErrorMsg);
                }
            } catch (\Exception $e) {
                $mailErrorMsg = $e->getMessage();
                Log::warning('Brevo HTTP API Exception: ' . $mailErrorMsg);
            }
        }

        // ២.៣. ប្រសិនបើនៅលើ Localhost ឬ Server ដែលបើក Port 587
        if (!$mailSent && empty($brevoApiKey) && empty($googleScriptUrl)) {
            config([
                'mail.default' => 'smtp',
                'mail.mailers.smtp' => [
                    'transport' => 'smtp',
                    'host' => env('MAIL_HOST', 'smtp.gmail.com'),
                    'port' => (int) env('MAIL_PORT', 587),
                    'encryption' => env('MAIL_ENCRYPTION', 'tls'),
                    'username' => $smtpUsername,
                    'password' => $smtpPassword,
                    'timeout' => 4,
                    'stream' => [
                        'ssl' => [
                            'allow_self_signed' => true,
                            'verify_peer' => false,
                            'verify_peer_name' => false,
                        ],
                    ],
                ],
                'mail.from.address' => $smtpFromAddress,
                'mail.from.name' => $smtpFromName,
            ]);

            try {
                app('mail.manager')->forgetMailers();
                Mail::mailer('smtp')->html($htmlContent, function ($message) use ($user, $subjectTitle, $smtpFromAddress, $smtpFromName) {
                    $message->from($smtpFromAddress, $smtpFromName)
                            ->to(trim($user->email))
                            ->subject($subjectTitle);
                });
                $mailSent = true;
            } catch (\Exception $e) {
                $mailErrorMsg = $e->getMessage();
                Log::error('OTP Email Send Error for ' . $user->email . ': ' . $mailErrorMsg);
                $mailSent = false;
            }
        }

        if ($mailSent) {
            $deliveryChannel = $telegramSent ? 'both' : 'email';
        }

        Log::info("6-Digit OTP ({$purpose}) for [{$user->email}] ({$rawRole}) via [{$deliveryChannel}]: {$otp}");

        return [
            'otp' => null,
            'mail_sent' => $mailSent,
            'mail_error' => $mailErrorMsg,
            'telegram_sent' => $telegramSent,
            'telegram_linked' => $isTelegramLinked,
            'telegram_link_url' => $isTelegramLinked ? null : $this->generateTelegramLinkUrl($user, false),
            'delivery_channel' => $deliveryChannel,
        ];
    }

    /**
     * ✅ មុខងារពិនិត្យ, ភ្ជាប់, និងផ្ដាច់គណនី Telegram (គាំទ្រ action = 'unlink')៖
     * - បើ action === 'unlink' -> ផ្ដាច់ Telegram ចេញពីគណនី ដើម្បីឱ្យលេខកូដ ៦ ខ្ទង់ផ្ញើចូលតែ Email វិញ
     * - ផ្ញើលេខកូដ ៦ ខ្ទង់ តែនៅពេលគណនីកំពុងស្ថិតក្នុងជំហានរង់ចាំផ្ទៀងផ្ទាត់ OTP (Login / Reset Password) ប៉ុណ្ណោះ!
     */
    public function checkTelegramLink(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'action' => 'nullable|string',
        ]);

        $cleanEmail = trim($request->email);
        $user = User::with('role:id,role_name')->where('email', $cleanEmail)->first();
        if (!$user) {
            return response()->json(['linked' => false, 'message' => 'រកមិនឃើញគណនីនេះទេ'], 404);
        }

        // ✅ ប្រសិនបើអ្នកប្រើប្រាស់ចុចប៊ូតុង «ផ្ដាច់ Telegram (Unlink)» នៅក្នុង Settings
        if ($request->input('action') === 'unlink') {
            $this->unlinkUserTelegramChatId($user);

            return response()->json([
                'linked' => false,
                'telegram_sent' => false,
                'telegram_link_url' => $this->generateTelegramLinkUrl($user, true),
                'message' => 'បានផ្ដាច់គណនី Telegram ជោគជ័យ! ចាប់ពីពេលនេះទៅ លេខកូដ ៦ ខ្ទង់នឹងត្រូវផ្ញើទៅកាន់ Email របស់អ្នកវិញ។',
            ]);
        }

        $botToken = env('TELEGRAM_BOT_TOKEN');
        if (!$botToken) {
            return response()->json(['linked' => false]);
        }

        $expectedToken = Cache::get('lms_tg_user_link_token_' . $user->id);
        $existingChatId = $this->resolveUserTelegramChatId($user);

        // ✅ បើគណនីបានភ្ជាប់ Telegram រួចហើយ ត្រឡប់លទ្ធផលភ្លាមៗក្នុង 0ms
        if ($existingChatId && !$expectedToken) {
            return response()->json([
                'linked' => true,
                'telegram_sent' => false,
                'telegram_link_url' => null,
            ]);
        }

        try {
            $res = Http::timeout(4)->get("https://api.telegram.org/bot{$botToken}/getUpdates", [
                'limit' => 50,
                'allowed_updates' => json_encode(['message']),
            ]);

            if ($res->successful()) {
                $updates = $res->json('result') ?? [];
                $matchedChatId = null;
                $matchedUpdateId = null;

                foreach (array_reverse($updates) as $upd) {
                    $updateId = $upd['update_id'] ?? null;
                    $text = trim((string) ($upd['message']['text'] ?? ''));
                    $chatId = $upd['message']['chat']['id'] ?? null;

                    if (!$chatId || !str_starts_with($text, '/start')) {
                        continue;
                    }

                    if (preg_match('/^\/start\s+link_([A-Za-z0-9_]+)$/i', $text, $matches)) {
                        $incomingToken = $matches[1];
                        $mappedUserId = Cache::get('lms_tg_link_token_map_' . $incomingToken);

                        $alreadyProcessedKey = 'lms_tg_processed_update_' . $updateId;
                        if (Cache::has($alreadyProcessedKey)) {
                            continue;
                        }

                        if (
                            ($expectedToken && $incomingToken === $expectedToken) ||
                            ($mappedUserId && (int) $mappedUserId === (int) $user->id)
                        ) {
                            $matchedChatId = (string) $chatId;
                            $matchedUpdateId = $updateId;
                            break;
                        }
                    }
                }

                if ($matchedChatId) {
                    if ($matchedUpdateId) {
                        Cache::forever('lms_tg_processed_update_' . $matchedUpdateId, true);
                    }

                    $this->saveUserTelegramChatId($user, $matchedChatId);

                    if ($expectedToken) {
                        Cache::forget('lms_tg_link_token_map_' . $expectedToken);
                    }
                    Cache::forget('lms_tg_user_link_token_' . $user->id);

                    // ✅ ពិនិត្យមើលថាតើអ្នកប្រើប្រាស់កំពុងស្ថិតនៅលើផ្ទាំងវាយលេខកូដ ៦ ខ្ទង់ (Login ឬ Reset Password) មែនឬអត់?
                    $pendingResetOtp = Cache::get('lms_pwd_reset_otp_' . $user->id);
                    $pending2faOtp = Cache::get('lms_2fa_otp_' . $user->id);
                    $sentOtpNow = false;

                    if ($pendingResetOtp) {
                        $newOtp = (string) random_int(100000, 999999);
                        Cache::put('lms_pwd_reset_otp_' . $user->id, $newOtp, now()->addMinutes(5));
                        $sentOtpNow = $this->sendTelegramOtpAlert($user->fresh('role'), $newOtp, $request, 'reset');
                    } elseif ($pending2faOtp) {
                        $newOtp = (string) random_int(100000, 999999);
                        Cache::put('lms_2fa_otp_' . $user->id, $newOtp, now()->addMinutes(5));
                        $sentOtpNow = $this->sendTelegramOtpAlert($user->fresh('role'), $newOtp, $request, '2fa');
                    }

                    return response()->json([
                        'linked' => true,
                        'telegram_sent' => $sentOtpNow,
                        'delivery_channel' => 'telegram',
                        'telegram_link_url' => null,
                        'message' => $sentOtpNow
                            ? 'ភ្ជាប់គណនី Telegram ជោគជ័យ! លេខកូដ ៦ ខ្ទង់ត្រូវបានផ្ញើចូល Telegram របស់អ្នកហើយ។'
                            : 'ភ្ជាប់គណនី Telegram ជោគជ័យ!',
                    ]);
                }
            }
        } catch (\Exception $e) {
            Log::warning('checkTelegramLink polling error: ' . $e->getMessage());
        }

        return response()->json([
            'linked' => $existingChatId !== null,
            'telegram_link_url' => $existingChatId ? null : $this->generateTelegramLinkUrl($user, false),
        ]);
    }

    // ✅ ចុះឈ្មោះគណនី Admin ដំបូង រួចភ្ជាប់ទិន្នន័យ Role ត្រឡប់ទៅឱ្យ Frontend ភ្លាមៗ
    public function register(Request $request)
    {
        // ការពារមិនឱ្យចុះឈ្មោះ Admin ថ្មីថែមទៀតប្រសិនបើមានគណនី Admin រួចហើយក្នុងប្រព័ន្ធ
        $adminRole = Role::whereRaw('LOWER(role_name) LIKE ?', ['%admin%'])->first();
        $adminRoleId = $adminRole?->id ?? 1;
        if (User::where('role_id', $adminRoleId)->exists()) {
            return response()->json([
                'message' => 'គណនីអ្នកគ្រប់គ្រងដំបូងត្រូវបានបង្កើតរួចហើយ! សូមចូលប្រើប្រាស់តាមរយៈទំព័រ Login។',
            ], 403);
        }

        $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8|confirmed',
            'role_id' => 'required|exists:roles,id',
        ]);

        $user = User::create([
            'first_name' => trim($request->first_name),
            'last_name' => trim($request->last_name),
            'email' => strtolower(trim($request->email)),
            'password' => Hash::make($request->password),
            'role_id' => $request->role_id,
            'status' => 'active',
        ]);

        Cache::forget('admin_dashboard_stats');
        Cache::forget('admin_overview_report');

        $user->load('role:id,role_name');
        $token = $user->createToken('auth_token')->plainTextToken;
        [$userData, $teacherData] = $this->buildUserAndTeacherPayload($user);

        return response()->json([
            'user' => $userData,
            'teacher' => $teacherData,
            'student' => $userData['student'] ?? null,
            'token' => $token,
            'message' => 'Registration successful',
        ], 201);
    }

    // ✅ ជំហានទី ១៖ ពិនិត្យ Email & Password + Lockout ១៥ នាទី
    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        $emailKey = strtolower(trim($request->email));
        $lockoutKey = 'lms_login_lockout_' . md5($emailKey . '_' . $request->ip());

        $failedLogins = (int) Cache::get($lockoutKey, 0);
        if ($failedLogins >= 5) {
            return response()->json([
                'message' => 'គណនីនេះត្រូវបានផ្អាកការចូលជាបណ្ដោះអាសន្នរយៈពេល ១៥ នាទី ដោយសារបញ្ចូលពាក្យសម្ងាត់ខុសលើសពី ៥ ដង!',
            ], 429);
        }

        $user = User::with('role:id,role_name')
            ->where('email', trim($request->email))
            ->first();

        if (!$user) {
            Cache::put($lockoutKey, $failedLogins + 1, now()->addMinutes(15));
            throw ValidationException::withMessages([
                'email' => ['អ៊ីមែលនេះមិនមានក្នុងប្រព័ន្ធ'],
            ]);
        }

        if (!Hash::check($request->password, $user->password)) {
            $newFailed = $failedLogins + 1;
            Cache::put($lockoutKey, $newFailed, now()->addMinutes(15));
            $remaining = max(0, 5 - $newFailed);

            throw ValidationException::withMessages([
                'password' => [
                    $remaining > 0
                        ? "ពាក្យសម្ងាត់មិនត្រឹមត្រូវ! (នៅសល់ឱកាស {$remaining} ដងទៀត)"
                        : 'អ្នកបានបញ្ចូលពាក្យសម្ងាត់ខុសលើសកំណត់! គណនីត្រូវបានផ្អាក ១៥ នាទី។',
                ],
            ]);
        }

        if ($user->status !== 'active') {
            throw ValidationException::withMessages([
                'email' => ['គណនីរបស់អ្នកត្រូវបានផ្អាកដំណើរការដោយអ្នកគ្រប់គ្រងប្រព័ន្ធ (Admin)!'],
            ]);
        }

        Cache::forget($lockoutKey);

        $deviceHash = $this->getDeviceFingerprint($request);
        $trustedDevices = Cache::get('lms_trusted_devices_' . $user->id, []);
        $isKnownDevice = in_array($deviceHash, is_array($trustedDevices) ? $trustedDevices : []);

        $savedPinHash = Cache::get('lms_security_pin_' . $user->id);
        $hasSecurityPin = !empty($savedPinHash);

        $otpResult = $this->generateAndSendOtp($user, $request, '2fa');

        if ($otpResult['telegram_sent'] && $otpResult['mail_sent']) {
            $statusMessage = 'លេខកូដផ្ទៀងផ្ទាត់ ៦ ខ្ទង់ត្រូវបានផ្ញើទៅកាន់ទាំង Telegram និងអ៊ីមែលរបស់អ្នកហើយ!';
        } elseif ($otpResult['telegram_sent']) {
            $statusMessage = 'លេខកូដផ្ទៀងផ្ទាត់ ៦ ខ្ទង់ត្រូវបានផ្ញើទៅកាន់កម្មវិធី Telegram របស់អ្នកហើយ!';
        } elseif ($otpResult['mail_sent']) {
            $statusMessage = 'លេខកូដផ្ទៀងផ្ទាត់ ៦ ខ្ទង់ត្រូវបានផ្ញើទៅកាន់អ៊ីមែលរបស់អ្នកហើយ!';
        } else {
            $statusMessage = 'សូមបញ្ចូលលេខកូដ ៦ ខ្ទង់ដើម្បីចូលប្រព័ន្ធ!';
        }

        return response()->json([
            'requires_2fa' => true,
            'email' => $user->email,
            'role_name' => $user->role?->role_name ?? 'User',
            'is_new_device' => !$isKnownDevice,
            'has_security_pin' => $hasSecurityPin,
            'requires_pin_verify' => $hasSecurityPin && !$isKnownDevice,
            'requires_pin_setup' => !$hasSecurityPin,
            'mail_sent' => $otpResult['mail_sent'],
            'mail_error' => $otpResult['mail_error'] ?? null,
            'telegram_sent' => $otpResult['telegram_sent'],
            'telegram_linked' => $otpResult['telegram_linked'],
            'telegram_link_url' => $otpResult['telegram_link_url'],
            'delivery_channel' => $otpResult['delivery_channel'],
            'dev_otp' => null,
            'message' => $statusMessage,
        ]);
    }

    // ✅ ជំហានទី ២៖ ផ្ទៀងផ្ទាត់លេខកូដ OTP ៦ ខ្ទង់
    public function verifyTwoFactor(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'otp_code' => 'required|digits:6',
            'security_pin' => 'nullable|digits:4',
            'logout_other_devices' => 'nullable|boolean',
        ]);

        $user = User::with('role:id,role_name')
            ->where('email', trim($request->email))
            ->first();

        if (!$user) {
            return response()->json([
                'message' => 'អ៊ីមែលនេះមិនមានក្នុងប្រព័ន្ធទេ',
            ], 404);
        }

        if ($user->status !== 'active') {
            return response()->json([
                'message' => 'គណនីរបស់អ្នកត្រូវបានបិទដោយអ្នកគ្រប់គ្រងប្រព័ន្ធ!',
            ], 403);
        }

        $otpLockoutKey = 'lms_2fa_lockout_' . $user->id;
        if (Cache::has($otpLockoutKey)) {
            return response()->json([
                'otp_expired' => true,
                'message' => 'គណនីនេះត្រូវបានផ្អាកការផ្ទៀងផ្ទាត់រយៈពេល ១៥ នាទី ដោយសារវាយលេខកូដខុសលើសកំណត់!',
            ], 429);
        }

        $cacheKey = 'lms_2fa_otp_' . $user->id;
        $attemptKey = 'lms_2fa_attempts_' . $user->id;
        $attempts = (int) Cache::get($attemptKey, 0);

        $cachedOtp = Cache::get($cacheKey);

        if (!$cachedOtp) {
            return response()->json([
                'otp_expired' => true,
                'message' => 'លេខកូដផ្ទៀងផ្ទាត់នេះបានផុតកំណត់ហើយ! សូមចុច «ផ្ញើលេខកូដម្ដងទៀត»។',
            ], 422);
        }

        if ((string) $cachedOtp !== (string) $request->otp_code) {
            $newAttempts = $attempts + 1;
            Cache::put($attemptKey, $newAttempts, now()->addMinutes(15));
            $remaining = max(0, 5 - $newAttempts);

            if ($remaining === 0) {
                Cache::forget($cacheKey);
                Cache::put($otpLockoutKey, true, now()->addMinutes(15));
                return response()->json([
                    'otp_expired' => true,
                    'message' => 'អ្នកបានបញ្ចូលលេខកូដខុសគ្រប់ ៥ ដងហើយ! គណនីត្រូវបានផ្អាកការចូលរយៈពេល ១៥ នាទី។',
                ], 429);
            }

            return response()->json([
                'remaining_attempts' => $remaining,
                'message' => "លេខកូដ OTP មិនត្រឹមត្រូវទេ! (នៅសល់ឱកាសព្យាយាម {$remaining} ដងទៀត)",
            ], 422);
        }

        $deviceHash = $this->getDeviceFingerprint($request);
        $trustedDevices = Cache::get('lms_trusted_devices_' . $user->id, []);
        $trustedDevices = is_array($trustedDevices) ? $trustedDevices : [];
        $isKnownDevice = in_array($deviceHash, $trustedDevices);

        if (!$isKnownDevice) {
            $trustedDevices[] = $deviceHash;
            $trustedDevices = array_slice(array_unique($trustedDevices), -5);
            Cache::put('lms_trusted_devices_' . $user->id, $trustedDevices, now()->addDays(30));
        }

        Cache::forget($cacheKey);
        Cache::forget($attemptKey);
        Cache::forget($otpLockoutKey);

        $shouldLogoutOthers = $request->boolean('logout_other_devices', true);
        if ($shouldLogoutOthers) {
            $user->tokens()->delete();
        }

        $token = $user->createToken('auth_token')->plainTextToken;
        [$userData, $teacherData] = $this->buildUserAndTeacherPayload($user);

        return response()->json([
            'user' => $userData,
            'token' => $token,
            'teacher' => $teacherData ?? null,
            'student' => $userData['student'] ?? null,
            'message' => 'ផ្ទៀងផ្ទាត់សុវត្ថិភាពជោគជ័យ! ចូលប្រព័ន្ធដោយជោគជ័យ',
        ]);
    }

    // ✅ ស្នើសុំផ្ញើលេខកូដ ៦ ខ្ទង់ម្ដងទៀត
    public function resendTwoFactor(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        $user = User::with('role:id,role_name')->where('email', trim($request->email))->first();

        if (!$user) {
            return response()->json([
                'message' => 'អ៊ីមែលនេះមិនមានក្នុងប្រព័ន្ធទេ',
            ], 404);
        }

        if (Cache::has('lms_2fa_lockout_' . $user->id)) {
            return response()->json([
                'message' => 'គណនីនេះកំពុងត្រូវបានផ្អាកជាបណ្ដោះអាសន្នរយៈពេល ១៥ នាទី!',
            ], 429);
        }

        $resendLimitKey = 'lms_2fa_resend_limit_' . $user->id;
        $resendCount = (int) Cache::get($resendLimitKey, 0);

        if ($resendCount >= 5) {
            return response()->json([
                'message' => 'អ្នកបានស្នើសុំលេខកូដច្រើនដងពេក! សូមរង់ចាំ ១០ នាទីក្រោយសិន។',
            ], 429);
        }

        Cache::put($resendLimitKey, $resendCount + 1, now()->addMinutes(10));

        $otpResult = $this->generateAndSendOtp($user, $request, '2fa');

        if ($otpResult['telegram_sent'] && $otpResult['mail_sent']) {
            $resendMsg = 'បានផ្ញើលេខកូដ ៦ ខ្ទង់ថ្មីទៅកាន់ទាំង Telegram និងអ៊ីមែលរបស់អ្នកម្ដងទៀតហើយ!';
        } elseif ($otpResult['telegram_sent']) {
            $resendMsg = 'បានផ្ញើលេខកូដ ៦ ខ្ទង់ថ្មីទៅកាន់កម្មវិធី Telegram របស់អ្នកម្ដងទៀតហើយ!';
        } elseif ($otpResult['mail_sent']) {
            $resendMsg = 'បានផ្ញើលេខកូដ ៦ ខ្ទង់ថ្មីទៅកាន់អ៊ីមែលរបស់អ្នកម្ដងទៀតហើយ!';
        } else {
            $resendMsg = 'បានបង្កើតលេខកូដ ៦ ខ្ទង់ថ្មីរួចរាល់ហើយ!';
        }

        return response()->json([
            'mail_sent' => $otpResult['mail_sent'],
            'mail_error' => $otpResult['mail_error'] ?? null,
            'telegram_sent' => $otpResult['telegram_sent'],
            'telegram_linked' => $otpResult['telegram_linked'],
            'telegram_link_url' => $otpResult['telegram_link_url'],
            'delivery_channel' => $otpResult['delivery_channel'],
            'dev_otp' => null,
            'message' => $resendMsg,
        ]);
    }

    // =========================================================================
    // 📌 មុខងារកំណត់ពាក្យសម្ងាត់ឡើងវិញដោយខ្លួនឯង (SELF-SERVICE PASSWORD RESET ៣ ជំហាន)
    // =========================================================================

    public function sendPasswordResetOtp(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        $user = User::with('role:id,role_name')
            ->where('email', trim($request->email))
            ->first();

        if (!$user) {
            throw ValidationException::withMessages([
                'email' => ['អ៊ីមែលនេះមិនមានក្នុងប្រព័ន្ធទេ!'],
            ]);
        }

        if ($user->status !== 'active') {
            throw ValidationException::withMessages([
                'email' => ['គណនីរបស់អ្នកត្រូវបានផ្អាកដំណើរការដោយអ្នកគ្រប់គ្រងប្រព័ន្ធ!'],
            ]);
        }

        $lockoutKey = 'lms_pwd_reset_lockout_' . $user->id;
        if (Cache::has($lockoutKey)) {
            return response()->json([
                'message' => 'គណនីនេះត្រូវបានផ្អាកការស្នើសុំប្ដូរពាក្យសម្ងាត់រយៈពេល ១៥ នាទី ដោយសារវាយលេខកូដខុសលើសកំណត់!',
            ], 429);
        }

        $resendLimitKey = 'lms_pwd_reset_resend_limit_' . $user->id;
        $resendCount = (int) Cache::get($resendLimitKey, 0);
        if ($resendCount >= 5) {
            return response()->json([
                'message' => 'អ្នកបានស្នើសុំលេខកូដច្រើនដងពេក! សូមរង់ចាំ ១០ នាទីក្រោយសិន។',
            ], 429);
        }
        Cache::put($resendLimitKey, $resendCount + 1, now()->addMinutes(10));

        $otpResult = $this->generateAndSendOtp($user, $request, 'reset');

        if ($otpResult['telegram_sent'] && $otpResult['mail_sent']) {
            $msg = 'លេខកូដ ៦ ខ្ទង់សម្រាប់កំណត់ពាក្យសម្ងាត់ថ្មីត្រូវបានផ្ញើទៅកាន់ទាំង Telegram និងអ៊ីមែលរបស់អ្នកហើយ!';
        } elseif ($otpResult['telegram_sent']) {
            $msg = 'លេខកូដ ៦ ខ្ទង់សម្រាប់កំណត់ពាក្យសម្ងាត់ថ្មីត្រូវបានផ្ញើទៅកាន់ Telegram របស់អ្នកហើយ!';
        } elseif ($otpResult['mail_sent']) {
            $msg = 'លេខកូដ ៦ ខ្ទង់សម្រាប់កំណត់ពាក្យសម្ងាត់ថ្មីត្រូវបានផ្ញើទៅកាន់អ៊ីមែលរបស់អ្នកហើយ!';
        } else {
            $msg = 'សូមបញ្ចូលលេខកូដ ៦ ខ្ទង់ដើម្បីកំណត់ពាក្យសម្ងាត់ថ្មី!';
        }

        return response()->json([
            'success' => true,
            'email' => $user->email,
            'role_name' => $user->role?->role_name ?? 'User',
            'mail_sent' => $otpResult['mail_sent'],
            'mail_error' => $otpResult['mail_error'] ?? null,
            'telegram_sent' => $otpResult['telegram_sent'],
            'telegram_linked' => $otpResult['telegram_linked'],
            'telegram_link_url' => $otpResult['telegram_link_url'],
            'dev_otp' => null,
            'message' => $msg,
        ]);
    }

    public function verifyPasswordResetOtp(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'otp_code' => 'required|digits:6',
        ]);

        $user = User::with('role:id,role_name')
            ->where('email', trim($request->email))
            ->first();

        if (!$user) {
            return response()->json(['message' => 'អ៊ីមែលនេះមិនមានក្នុងប្រព័ន្ធទេ!'], 404);
        }

        $lockoutKey = 'lms_pwd_reset_lockout_' . $user->id;
        if (Cache::has($lockoutKey)) {
            return response()->json([
                'otp_expired' => true,
                'message' => 'គណនីនេះត្រូវបានផ្អាកការផ្ទៀងផ្ទាត់រយៈពេល ១៥ នាទី ដោយសារវាយលេខកូដខុសលើសកំណត់!',
            ], 429);
        }

        $cacheKey = 'lms_pwd_reset_otp_' . $user->id;
        $attemptKey = 'lms_pwd_reset_attempts_' . $user->id;
        $attempts = (int) Cache::get($attemptKey, 0);

        $cachedOtp = Cache::get($cacheKey);
        if (!$cachedOtp) {
            return response()->json([
                'otp_expired' => true,
                'message' => 'លេខកូដផ្ទៀងផ្ទាត់នេះបានផុតកំណត់ហើយ! សូមចុច «ផ្ញើលេខកូដម្ដងទៀត»។',
            ], 422);
        }

        if ((string) $cachedOtp !== (string) $request->otp_code) {
            $newAttempts = $attempts + 1;
            Cache::put($attemptKey, $newAttempts, now()->addMinutes(15));
            $remaining = max(0, 5 - $newAttempts);

            if ($remaining === 0) {
                Cache::forget($cacheKey);
                Cache::put($lockoutKey, true, now()->addMinutes(15));
                return response()->json([
                    'otp_expired' => true,
                    'message' => 'អ្នកបានបញ្ចូលលេខកូដខុសគ្រប់ ៥ ដងហើយ! គណនីត្រូវបានផ្អាក ១៥ នាទី។',
                ], 429);
            }

            return response()->json([
                'remaining_attempts' => $remaining,
                'message' => "លេខកូដ OTP មិនត្រឹមត្រូវទេ! (នៅសល់ឱកាសព្យាយាម {$remaining} ដងទៀត)",
            ], 422);
        }

        Cache::forget($cacheKey);
        Cache::forget($attemptKey);

        $resetToken = Str::random(64);
        Cache::put('lms_pwd_reset_verified_token_' . $user->id, Hash::make($resetToken), now()->addMinutes(5));

        return response()->json([
            'success' => true,
            'reset_token' => $resetToken,
            'message' => 'ផ្ទៀងផ្ទាត់លេខកូដជោគជ័យ! សូមបញ្ចូលពាក្យសម្ងាត់ថ្មីរបស់អ្នក។',
        ]);
    }

    public function resetPasswordWithOtp(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'reset_token' => 'required|string',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $user = User::with('role:id,role_name')
            ->where('email', trim($request->email))
            ->first();

        if (!$user) {
            return response()->json(['message' => 'អ៊ីមែលនេះមិនមានក្នុងប្រព័ន្ធទេ!'], 404);
        }

        $tokenCacheKey = 'lms_pwd_reset_verified_token_' . $user->id;
        $savedTokenHash = Cache::get($tokenCacheKey);

        if (!$savedTokenHash || !Hash::check($request->reset_token, $savedTokenHash)) {
            return response()->json([
                'message' => 'សម័យកាលប្ដូរពាក្យសម្ងាត់បានផុតកំណត់ហើយ! សូមផ្ទៀងផ្ទាត់លេខកូដម្ដងទៀត។',
            ], 422);
        }

        $user->password = Hash::make($request->password);
        $user->save();

        Cache::forget($tokenCacheKey);
        Cache::forget('lms_pwd_reset_otp_' . $user->id);
        Cache::forget('lms_pwd_reset_attempts_' . $user->id);
        Cache::forget('lms_pwd_reset_lockout_' . $user->id);
        Cache::forget('lms_login_lockout_' . md5(strtolower(trim($user->email)) . '_' . $request->ip()));

        $user->tokens()->delete();

        $token = $user->createToken('auth_token')->plainTextToken;
        [$userData, $teacherData] = $this->buildUserAndTeacherPayload($user);

        return response()->json([
            'success' => true,
            'user' => $userData,
            'token' => $token,
            'teacher' => $teacherData ?? null,
            'student' => $userData['student'] ?? null,
            'message' => 'បានផ្លាស់ប្ដូរពាក្យសម្ងាត់ថ្មី និងចូលប្រព័ន្ធដោយជោគជ័យ!',
        ]);
    }

    public function logout(Request $request)
    {
        if ($request->boolean('all_devices')) {
            $request->user()?->tokens()?->delete();
        } else {
            $request->user()?->currentAccessToken()?->delete();
        }

        return response()->json([
            'message' => 'បានចាកចេញពីប្រព័ន្ធដោយជោគជ័យ',
        ]);
    }

    public function user(Request $request)
    {
        $user = User::with('role:id,role_name')->find($request->user()?->id);

        if (!$user || $user->status !== 'active') {
            $request->user()?->tokens()?->delete();
            return response()->json(['message' => 'គណនីរបស់អ្នកត្រូវបានផ្អាកដំណើរការ!'], 403);
        }

        [$userData, $teacherData] = $this->buildUserAndTeacherPayload($user);

        return response()->json([
            'user' => $userData,
            'teacher' => $teacherData,
            'student' => $userData['student'] ?? null,
        ]);
    }
}