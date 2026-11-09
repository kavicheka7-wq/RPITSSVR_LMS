<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Teacher;
use App\Models\Role;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * HELPER METHOD: រៀបចំទម្រង់ទិន្នន័យ User និង Teacher
     */
    private function buildUserAndTeacherPayload(User $user)
    {
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

        if ($user->role?->role_name === 'Teacher') {
            $teacher = Teacher::with([
                'department:id,department_name',
                'role:id,role_name'
            ])
            ->select([
                'id', 'user_id', 'role_id', 'department_id',
                'teacher_code', 'first_name', 'last_name', 'gender',
                'date_of_birth', 'email', 'phone', 'specialization',
                'employment_type'
            ])
            ->where('user_id', $user->id)
            ->first();

            if ($teacher) {
                $userData['teacher_id'] = $teacher->id;
                $userData['teacher_code'] = $teacher->teacher_code;
                $userData['specialization'] = $teacher->specialization;
                $userData['department_id'] = $teacher->department_id;
                $userData['department_name'] = $teacher->department?->department_name;
                $userData['employment_type'] = $teacher->employment_type;
                $userData['date_of_birth'] = $teacher->date_of_birth;
                $userData['teacher_first_name'] = $teacher->first_name;
                $userData['teacher_last_name'] = $teacher->last_name;
                $userData['teacher_email'] = $teacher->email;
                $userData['teacher_phone'] = $teacher->phone;
                $userData['teacher_gender'] = $teacher->gender;
                $userData['teacher_role'] = $teacher->role;
                $userData['is_teacher'] = true;

                $teacherData = $teacher;
            } else {
                $userData['is_teacher'] = false;
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
     * ✅ HELPER METHOD: បង្កើតតំណភ្ជាប់ Telegram Deep-Link សម្រាប់ឱ្យអ្នកប្រើ ឬកូនក្រុមចុចភ្ជាប់/ប្ដូរ Telegram មកទូរស័ព្ទខ្លួនឯងក្នុង ១ ចុច
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
     * HELPER METHOD: ផ្ញើលេខកូដ 2FA ឬលេខកូដកំណត់ពាក្យសម្ងាត់ឡើងវិញ (៦ ខ្ទង់) ទៅកាន់ Telegram Bot
     */
    private function sendTelegramOtpAlert(User $user, string $otp, Request $request, string $purpose = '2fa'): bool
    {
        $botToken = env('TELEGRAM_BOT_TOKEN');
        $chatId = $this->resolveUserTelegramChatId($user);

        if (!$botToken || !$chatId) {
            return false;
        }

        $fullName = trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')) ?: 'អ្នកប្រើប្រាស់';
        $roleName = $user->role?->role_name ?? 'User';
        $ip = $request->ip() ?? 'Unknown IP';
        $time = now()->format('d-m-Y H:i:s');

        $headerTitle = $purpose === 'reset'
            ? "🔐 *RPITSSVR LMS - លេខកូដកំណត់ពាក្យសម្ងាត់ឡើងវិញ*"
            : "🛡️ *RPITSSVR LMS - ផ្ទៀងផ្ទាត់សុវត្ថិភាព 2FA*";

        $text = "{$headerTitle}\n\n"
              . "👤 គណនី៖ *{$fullName}* ({$roleName})\n"
              . "📧 អ៊ីមែល៖ `{$user->email}`\n"
              . "🔑 លេខកូដ ៦ ខ្ទង់៖ *`{$otp}`*\n\n"
              . "🌐 IP៖ `{$ip}`\n"
              . "🕒 ម៉ោង៖ `{$time}`\n"
              . "🔒 _សូមកុំប្រាប់លេខកូដនេះទៅអ្នកដទៃដាច់ខាត!_";

        try {
            $response = Http::timeout(5)->post("https://api.telegram.org/bot{$botToken}/sendMessage", [
                'chat_id' => $chatId,
                'text' => $text,
                'parse_mode' => 'Markdown',
            ]);

            return $response->successful();
        } catch (\Exception $e) {
            Log::warning('Telegram OTP send failed for ' . $user->email . ': ' . $e->getMessage());
            return false;
        }
    }

    /**
     * ✅ HELPER METHOD: បង្កើត និងផ្ញើលេខកូដ ៦ ខ្ទង់ទៅកាន់ទាំង Email និង Telegram របស់អ្នកប្រើប្រាស់ម្នាក់ៗដែល Login ចូលផ្ទាល់
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

        $fullName = trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')) ?: 'អ្នកប្រើប្រាស់';
        $roleName = $user->role?->role_name ?? 'User';
        $ipAddress = $request->ip() ?? 'Unknown IP';
        $userAgent = substr((string) $request->userAgent(), 0, 120) ?: 'Unknown Device';
        $timeNow = now()->format('d-m-Y H:i:s');

        $telegramSent = false;
        $mailSent = false;
        $mailErrorMsg = null;
        $deliveryChannel = 'none';

        $isTelegramLinked = $this->resolveUserTelegramChatId($user) !== null;

        // ១. ផ្ញើទៅកាន់ Telegram របស់អ្នកប្រើប្រាស់ (ប្រសិនបើបានភ្ជាប់)
        if ($isTelegramLinked) {
            $telegramSent = $this->sendTelegramOtpAlert($user, $otp, $request, $purpose);
            if ($telegramSent) {
                $deliveryChannel = 'telegram';
            }
        }

        // ២. ផ្ញើទៅកាន់ Email របស់អ្នកប្រើប្រាស់ដែលកំពុង Login ជានិច្ច (គ្រប់ពេល Login និង Reset Password)
        $purposeLabel = $purpose === 'reset'
            ? 'សម្រាប់កំណត់ពាក្យសម្ងាត់ថ្មីរបស់អ្នក'
            : 'សម្រាប់ចូលប្រើប្រាស់ប្រព័ន្ធរបស់អ្នក';

        $subjectTitle = $purpose === 'reset'
            ? 'លេខកូដកំណត់ពាក្យសម្ងាត់ឡើងវិញ (៦ ខ្ទង់) - RPITSSVR LMS'
            : 'លេខកូដផ្ទៀងផ្ទាត់សុវត្ថិភាព 2FA (៦ ខ្ទង់) - RPITSSVR LMS';

        $htmlContent = "
            <div style='font-family: \"Kantumruy Pro\", \"Battambang\", sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;'>
                <h2 style='color: #1e3a8a; margin-bottom: 8px; font-size: 18px;'>វិទ្យាស្ថានពហុបច្ចេកទេសភូមិភាគតេជោសែនស្វាយរៀង (RPITSSVR LMS)</h2>
                <p style='color: #334155; font-size: 14px;'>សួស្តី <strong>{$fullName}</strong> ({$roleName}),</p>
                <p style='color: #475569; font-size: 14px; line-height: 1.6;'>នេះគឺជាលេខកូដផ្ទៀងផ្ទាត់ ៦ ខ្ទង់ {$purposeLabel}៖</p>
                <div style='margin: 20px 0; padding: 18px; background: #eff6ff; border: 2px dashed #3b82f6; border-radius: 12px; text-align: center;'>
                    <span style='font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #1d4ed8;'>{$otp}</span>
                </div>
                <div style='background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-bottom: 16px; font-size: 12px; color: #475569;'>
                    <div><strong>🕒 ម៉ោងស្នើសុំ៖</strong> {$timeNow}</div>
                    <div><strong>🌐 អាសយដ្ឋាន IP៖</strong> {$ipAddress}</div>
                    <div><strong>💻 ឧបករណ៍៖</strong> {$userAgent}</div>
                </div>
                <p style='color: #e11d48; font-size: 12px; font-weight: bold; line-height: 1.5;'>⚠️ ប្រសិនបើអ្នកមិនបានធ្វើការស្នើសុំនេះទេ សូមកុំប្រាប់លេខកូដនេះទៅអ្នកដទៃដាច់ខាត។</p>
            </div>
        ";

        // កំណត់ Gmail SMTP ដោយផ្ទាល់ និងបិទ verify_peer ដើម្បីកុំឱ្យជាប់គាំង SSL Certificate លើ Local/Server
        $smtpUsername = trim((string) env('MAIL_USERNAME', 'kavicheka7@gmail.com'));
        $smtpPassword = str_replace(' ', '', trim((string) env('MAIL_PASSWORD', 'cdezkfuqvznodtsp')));
        $smtpFromAddress = trim((string) env('MAIL_FROM_ADDRESS', $smtpUsername));
        $smtpFromName = trim((string) env('MAIL_FROM_NAME', 'RPITSSVR LMS'));

        config([
            'mail.default' => 'smtp',
            'mail.mailers.smtp' => [
                'transport' => 'smtp',
                'host' => env('MAIL_HOST', 'smtp.gmail.com'),
                'port' => (int) env('MAIL_PORT', 587),
                'encryption' => env('MAIL_ENCRYPTION', 'tls'),
                'username' => $smtpUsername,
                'password' => $smtpPassword,
                'timeout' => 15,
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
            $deliveryChannel = $telegramSent ? 'both' : 'email';
        } catch (\Exception $e) {
            $mailErrorMsg = $e->getMessage();
            Log::error('OTP Email Send Error for ' . $user->email . ': ' . $mailErrorMsg);
            $mailSent = false;
        }

        Log::info("6-Digit OTP ({$purpose}) for [{$user->email}] ({$roleName}) via [{$deliveryChannel}]: {$otp}");

        $shouldExposeDevOtp = !$telegramSent && !$mailSent;

        return [
            'otp' => $shouldExposeDevOtp ? $otp : null,
            'mail_sent' => $mailSent,
            'mail_error' => $mailErrorMsg,
            'telegram_sent' => $telegramSent,
            'telegram_linked' => $isTelegramLinked,
            'telegram_link_url' => $this->generateTelegramLinkUrl($user, true),
            'delivery_channel' => $deliveryChannel,
        ];
    }

    /**
     * ✅ មុខងារពិនិត្យ និងភ្ជាប់/ប្ដូរគណនី Telegram ដោយស្វ័យប្រវត្តិ ១០០%
     */
    public function checkTelegramLink(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        $user = User::with('role:id,role_name')->where('email', $request->email)->first();
        if (!$user) {
            return response()->json(['linked' => false, 'message' => 'រកមិនឃើញគណនីនេះទេ'], 404);
        }

        $botToken = env('TELEGRAM_BOT_TOKEN');
        if (!$botToken) {
            return response()->json(['linked' => false]);
        }

        $expectedToken = Cache::get('lms_tg_user_link_token_' . $user->id);

        try {
            $res = Http::timeout(5)->get("https://api.telegram.org/bot{$botToken}/getUpdates", [
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
                            ($mappedUserId && (int) $mappedUserId === (int) $user->id) ||
                            str_starts_with($incomingToken, $user->id . '_')
                        ) {
                            $matchedChatId = (string) $chatId;
                            $matchedUpdateId = $updateId;
                            break;
                        }
                    }
                }

                if ($matchedChatId) {
                    if ($matchedUpdateId) {
                        Cache::put('lms_tg_processed_update_' . $matchedUpdateId, true, now()->addHours(24));
                    }

                    $this->saveUserTelegramChatId($user, $matchedChatId);

                    if ($expectedToken) {
                        Cache::forget('lms_tg_link_token_map_' . $expectedToken);
                    }
                    Cache::forget('lms_tg_user_link_token_' . $user->id);

                    $resetOtp = Cache::get('lms_pwd_reset_otp_' . $user->id);
                    if ($resetOtp) {
                        $newOtp = (string) random_int(100000, 999999);
                        Cache::put('lms_pwd_reset_otp_' . $user->id, $newOtp, now()->addMinutes(5));
                        $this->sendTelegramOtpAlert($user->fresh('role'), $newOtp, $request, 'reset');
                    } else {
                        $newOtp = (string) random_int(100000, 999999);
                        Cache::put('lms_2fa_otp_' . $user->id, $newOtp, now()->addMinutes(5));
                        $this->sendTelegramOtpAlert($user->fresh('role'), $newOtp, $request, '2fa');
                    }

                    return response()->json([
                        'linked' => true,
                        'telegram_sent' => true,
                        'delivery_channel' => 'telegram',
                        'telegram_link_url' => $this->generateTelegramLinkUrl($user, true),
                        'message' => 'ភ្ជាប់គណនី Telegram ជោគជ័យ! លេខកូដ ៦ ខ្ទង់ត្រូវបានផ្ញើចូល Telegram របស់អ្នកហើយ។',
                    ]);
                }
            }
        } catch (\Exception $e) {
            Log::warning('checkTelegramLink polling error: ' . $e->getMessage());
        }

        return response()->json([
            'linked' => false,
            'telegram_link_url' => $this->generateTelegramLinkUrl($user),
        ]);
    }

    public function register(Request $request)
    {
        $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8|confirmed',
            'role_id' => 'required|exists:roles,id',
        ]);

        $user = User::create([
            'first_name' => $request->first_name,
            'last_name' => $request->last_name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
            'role_id' => $request->role_id,
            'status' => 'active',
        ]);

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'user' => $user,
            'token' => $token,
            'message' => 'Registration successful'
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
                'message' => 'គណនីនេះត្រូវបានផ្អាកការចូលជាបណ្ដោះអាសន្នរយៈពេល ១៥ នាទី ដោយសារបញ្ចូលពាក្យសម្ងាត់ខុសលើសពី ៥ ដង!'
            ], 429);
        }

        $user = User::with('role:id,role_name')
            ->where('email', $request->email)
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
                        : 'អ្នកបានបញ្ចូលពាក្យសម្ងាត់ខុសលើសកំណត់! គណនីត្រូវបានផ្អាក ១៥ នាទី។'
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
        } elseif ($otpResult['mail_sent']) {
            $statusMessage = 'លេខកូដផ្ទៀងផ្ទាត់ ៦ ខ្ទង់ត្រូវបានផ្ញើទៅកាន់អ៊ីមែលរបស់អ្នកហើយ!';
        } elseif ($otpResult['telegram_sent']) {
            $statusMessage = 'លេខកូដផ្ទៀងផ្ទាត់ ៦ ខ្ទង់ត្រូវបានផ្ញើទៅកាន់កម្មវិធី Telegram របស់អ្នកហើយ!';
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
            'dev_otp' => $otpResult['otp'],
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
            ->where('email', $request->email)
            ->first();

        if (!$user) {
            return response()->json([
                'message' => 'អ៊ីមែលនេះមិនមានក្នុងប្រព័ន្ធទេ'
            ], 404);
        }

        if ($user->status !== 'active') {
            return response()->json([
                'message' => 'គណនីរបស់អ្នកត្រូវបានបិទដោយអ្នកគ្រប់គ្រងប្រព័ន្ធ!'
            ], 403);
        }

        $otpLockoutKey = 'lms_2fa_lockout_' . $user->id;
        if (Cache::has($otpLockoutKey)) {
            return response()->json([
                'otp_expired' => true,
                'message' => 'គណនីនេះត្រូវបានផ្អាកការផ្ទៀងផ្ទាត់រយៈពេល ១៥ នាទី ដោយសារវាយលេខកូដខុសលើសកំណត់!'
            ], 429);
        }

        $cacheKey = 'lms_2fa_otp_' . $user->id;
        $attemptKey = 'lms_2fa_attempts_' . $user->id;
        $attempts = (int) Cache::get($attemptKey, 0);

        $cachedOtp = Cache::get($cacheKey);

        if (!$cachedOtp) {
            return response()->json([
                'otp_expired' => true,
                'message' => 'លេខកូដផ្ទៀងផ្ទាត់នេះបានផុតកំណត់ហើយ! សូមចុច «ផ្ញើលេខកូដម្ដងទៀត»។'
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
                    'message' => 'អ្នកបានបញ្ចូលលេខកូដខុសគ្រប់ ៥ ដងហើយ! គណនីត្រូវបានផ្អាកការចូលរយៈពេល ១៥ នាទី។'
                ], 429);
            }

            return response()->json([
                'remaining_attempts' => $remaining,
                'message' => "លេខកូដ OTP មិនត្រឹមត្រូវទេ! (នៅសល់ឱកាសព្យាយាម {$remaining} ដងទៀត)"
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
            'message' => 'ផ្ទៀងផ្ទាត់សុវត្ថិភាពជោគជ័យ! ចូលប្រព័ន្ធដោយជោគជ័យ'
        ]);
    }

    // ✅ ស្នើសុំផ្ញើលេខកូដ ៦ ខ្ទង់ម្ដងទៀត
    public function resendTwoFactor(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        $user = User::with('role:id,role_name')->where('email', $request->email)->first();

        if (!$user) {
            return response()->json([
                'message' => 'អ៊ីមែលនេះមិនមានក្នុងប្រព័ន្ធទេ'
            ], 404);
        }

        if (Cache::has('lms_2fa_lockout_' . $user->id)) {
            return response()->json([
                'message' => 'គណនីនេះកំពុងត្រូវបានផ្អាកជាបណ្ដោះអាសន្នរយៈពេល ១៥ នាទី!'
            ], 429);
        }

        $resendLimitKey = 'lms_2fa_resend_limit_' . $user->id;
        $resendCount = (int) Cache::get($resendLimitKey, 0);

        if ($resendCount >= 5) {
            return response()->json([
                'message' => 'អ្នកបានស្នើសុំលេខកូដច្រើនដងពេក! សូមរង់ចាំ ១០ នាទីក្រោយសិន។'
            ], 429);
        }

        Cache::put($resendLimitKey, $resendCount + 1, now()->addMinutes(10));

        $otpResult = $this->generateAndSendOtp($user, $request, '2fa');

        if ($otpResult['telegram_sent'] && $otpResult['mail_sent']) {
            $resendMsg = 'បានផ្ញើលេខកូដ ៦ ខ្ទង់ថ្មីទៅកាន់ទាំង Telegram និងអ៊ីមែលរបស់អ្នកម្ដងទៀតហើយ!';
        } elseif ($otpResult['mail_sent']) {
            $resendMsg = 'បានផ្ញើលេខកូដ ៦ ខ្ទង់ថ្មីទៅកាន់អ៊ីមែលរបស់អ្នកម្ដងទៀតហើយ!';
        } elseif ($otpResult['telegram_sent']) {
            $resendMsg = 'បានផ្ញើលេខកូដ ៦ ខ្ទង់ថ្មីទៅកាន់កម្មវិធី Telegram របស់អ្នកម្ដងទៀតហើយ!';
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
            'dev_otp' => $otpResult['otp'],
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
                'message' => 'គណនីនេះត្រូវបានផ្អាកការស្នើសុំប្ដូរពាក្យសម្ងាត់រយៈពេល ១៥ នាទី ដោយសារវាយលេខកូដខុសលើសកំណត់!'
            ], 429);
        }

        $resendLimitKey = 'lms_pwd_reset_resend_limit_' . $user->id;
        $resendCount = (int) Cache::get($resendLimitKey, 0);
        if ($resendCount >= 5) {
            return response()->json([
                'message' => 'អ្នកបានស្នើសុំលេខកូដច្រើនដងពេក! សូមរង់ចាំ ១០ នាទីក្រោយសិន។'
            ], 429);
        }
        Cache::put($resendLimitKey, $resendCount + 1, now()->addMinutes(10));

        $otpResult = $this->generateAndSendOtp($user, $request, 'reset');

        if ($otpResult['telegram_sent'] && $otpResult['mail_sent']) {
            $msg = 'លេខកូដ ៦ ខ្ទង់សម្រាប់កំណត់ពាក្យសម្ងាត់ថ្មីត្រូវបានផ្ញើទៅកាន់ទាំង Telegram និងអ៊ីមែលរបស់អ្នកហើយ!';
        } elseif ($otpResult['mail_sent']) {
            $msg = 'លេខកូដ ៦ ខ្ទង់សម្រាប់កំណត់ពាក្យសម្ងាត់ថ្មីត្រូវបានផ្ញើទៅកាន់អ៊ីមែលរបស់អ្នកហើយ!';
        } elseif ($otpResult['telegram_sent']) {
            $msg = 'លេខកូដ ៦ ខ្ទង់សម្រាប់កំណត់ពាក្យសម្ងាត់ថ្មីត្រូវបានផ្ញើទៅកាន់ Telegram របស់អ្នកហើយ!';
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
            'dev_otp' => $otpResult['otp'],
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
                'message' => 'គណនីនេះត្រូវបានផ្អាកការផ្ទៀងផ្ទាត់រយៈពេល ១៥ នាទី ដោយសារវាយលេខកូដខុសលើសកំណត់!'
            ], 429);
        }

        $cacheKey = 'lms_pwd_reset_otp_' . $user->id;
        $attemptKey = 'lms_pwd_reset_attempts_' . $user->id;
        $attempts = (int) Cache::get($attemptKey, 0);

        $cachedOtp = Cache::get($cacheKey);
        if (!$cachedOtp) {
            return response()->json([
                'otp_expired' => true,
                'message' => 'លេខកូដផ្ទៀងផ្ទាត់នេះបានផុតកំណត់ហើយ! សូមចុច «ផ្ញើលេខកូដម្ដងទៀត»។'
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
                    'message' => 'អ្នកបានបញ្ចូលលេខកូដខុសគ្រប់ ៥ ដងហើយ! គណនីត្រូវបានផ្អាក ១៥ នាទី។'
                ], 429);
            }

            return response()->json([
                'remaining_attempts' => $remaining,
                'message' => "លេខកូដ OTP មិនត្រឹមត្រូវទេ! (នៅសល់ឱកាសព្យាយាម {$remaining} ដងទៀត)"
            ], 422);
        }

        Cache::forget($cacheKey);
        Cache::forget($attemptKey);

        $resetToken = Str::random(64);
        Cache::put('lms_pwd_reset_verified_token_' . $user->id, Hash::make($resetToken), now()->addMinutes(5));

        return response()->json([
            'success' => true,
            'reset_token' => $resetToken,
            'message' => 'ផ្ទៀងផ្ទាត់លេខកូដជោគជ័យ! សូមបញ្ចូលពាក្យសម្ងាត់ថ្មីរបស់អ្នក។'
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
                'message' => 'សម័យកាលប្ដូរពាក្យសម្ងាត់បានផុតកំណត់ហើយ! សូមផ្ទៀងផ្ទាត់លេខកូដម្ដងទៀត។'
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
            'message' => 'បានផ្លាស់ប្ដូរពាក្យសម្ងាត់ថ្មី និងចូលប្រព័ន្ធដោយជោគជ័យ!'
        ]);
    }

    public function logout(Request $request)
    {
        if ($request->boolean('all_devices')) {
            $request->user()->tokens()->delete();
        } else {
            $request->user()->currentAccessToken()->delete();
        }

        return response()->json([
            'message' => 'បានចាកចេញពីប្រព័ន្ធដោយជោគជ័យ'
        ]);
    }

    public function user(Request $request)
    {
        $user = User::with('role:id,role_name')->find($request->user()->id);

        if (!$user || $user->status !== 'active') {
            $request->user()?->tokens()?->delete();
            return response()->json(['message' => 'គណនីរបស់អ្នកត្រូវបានផ្អាកដំណើរការ!'], 403);
        }

        [$userData, $teacherData] = $this->buildUserAndTeacherPayload($user);

        return response()->json([
            'user' => $userData,
            'teacher' => $teacherData
        ]);
    }
}