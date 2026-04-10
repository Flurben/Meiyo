import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, UploadCloud, Image as ImageIcon, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../AuthProvider';

interface ProfilePhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfilePhotoModal: React.FC<ProfilePhotoModalProps> = ({ isOpen, onClose }) => {
  const { user, userData, updateUser } = useAuth();
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const validateFile = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      setError(null);

      // Check file type
      if (file.type !== 'image/jpeg' && file.type !== 'image/png') {
        setError('Only JPG and PNG formats are allowed.');
        resolve(false);
        return;
      }

      // Check file size (500kb)
      if (file.size > 500 * 1024) {
        setError('File size must be less than 500 KB.');
        resolve(false);
        return;
      }

      // Check image dimensions
      const img = new Image();
      img.onload = () => {
        if (img.width > 512 || img.height > 512) {
          setError('Image dimensions must be 512x512 pixels or smaller.');
          resolve(false);
        } else {
          resolve(true);
        }
      };
      img.onerror = () => {
        setError('Invalid image file.');
        resolve(false);
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const isValid = await validateFile(file);
      if (isValid) {
        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
      }
    }
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const isValid = await validateFile(file);
      if (isValid) {
        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !user || !userData) return;
    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      try {
        await updateUser({ photoURL: base64 });
        onClose();
        // Reset state
        setSelectedFile(null);
        setPreviewUrl(null);
      } catch (err) {
        console.error("Upload error:", err);
        setError("Failed to upload image. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(selectedFile);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative"
        >
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors z-10"
          >
            <X size={24} />
          </button>

          <div className="p-8">
            <h2 className="text-2xl font-black text-white mb-2 text-center">
              Update Profile Photo
            </h2>
            <p className="text-slate-400 text-sm text-center mb-6">
              Max size: 500 KB. Max dimensions: 512x512. Formats: JPG, PNG.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-sm text-red-200 flex items-center gap-2">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            {!selectedFile ? (
              <div 
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                  dragActive ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 hover:border-slate-500 hover:bg-slate-800/50'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg, image/png"
                  onChange={handleChange}
                  className="hidden"
                />
                <UploadCloud size={48} className="mx-auto text-slate-400 mb-4" />
                <p className="text-white font-medium mb-1">Drag and drop your image here</p>
                <p className="text-slate-400 text-sm">or click to browse files</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col items-center justify-center p-6 bg-slate-800 rounded-xl border border-slate-700">
                  <div className="relative w-32 h-32 rounded-full overflow-hidden border-4 border-slate-700 mb-4">
                    <img src={previewUrl!} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                    <CheckCircle size={16} />
                    Image ready to upload
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setSelectedFile(null);
                      setPreviewUrl(null);
                      setError(null);
                    }}
                    className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-colors border border-slate-700"
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={loading}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Uploading...' : 'Upload Photo'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
