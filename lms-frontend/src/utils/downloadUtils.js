import api from '../services/api';
import { toast } from 'react-toastify';

export const getStorageUrl = (path) => {
  if (!path) return '#';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
    return path;
  }
  const backendBase = (api.defaults?.baseURL || 'http://localhost:8000/api').replace(/\/api\/?$/, '');
  const cleanPath = path.replace(/^\/?storage\//, '');
  return `${backendBase}/api/download-file?path=${encodeURIComponent(cleanPath)}`;
};

export const handleDownloadFile = async (path, customFileName) => {
  if (!path) {
    toast.error('គ្មានព័ត៌មានឯកសារ (No file path provided)');
    return;
  }

  // External URL (e.g. YouTube or web link)
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
    window.open(path, '_blank');
    return;
  }

  const cleanPath = path.replace(/^\/?storage\//, '');

  try {
    // 1. Check existence via 200 OK endpoint to prevent browser console 404 logs
    const checkRes = await api.get(`/check-file-exists?path=${encodeURIComponent(cleanPath)}`);
    
    if (!checkRes.data?.exists) {
      toast.error('ឯកសារនេះមិនមាននៅលើ Server ទេ (File not found on server)');
      return;
    }

    // 2. File exists! Proceed to download.
    const url = getStorageUrl(path);
    const response = await fetch(url);
    if (!response.ok) {
      toast.error('មិនអាចទាញយកឯកសារបានទេ (Failed to download file)');
      return;
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    
    const fileName = customFileName || path.split('/').pop() || 'downloaded_file';
    link.download = fileName;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error('Download error:', err);
    toast.error('មានបញ្ហាក្នុងការទាញយកឯកសារ');
  }
};
