import { 
  ref, 
  uploadBytesResumable, 
  getDownloadURL,
  deleteObject 
} from 'firebase/storage';
import { storage } from '../firebase';

export const storageService = {
  async uploadFile(file, userId, docId, onProgress) {
    try {
      // Create a safe filename
      const fileExt = file.name.split('.').pop().toLowerCase();
      const safeFilename = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
      const storagePath = `users/${userId}/original_${docId}.${fileExt}`;
      const storageRef = ref(storage, storagePath);
      
      // Create upload task
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      // Return promise with progress
      return new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
          (snapshot) => {
            const progress = Math.round(
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            );
            onProgress(progress);
          },
          (error) => reject(error),
          async () => {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve({ downloadURL, storagePath });
          }
        );
      });
      
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  },
  
  async deleteFile(storagePath) {
    try {
      const fileRef = ref(storage, storagePath);
      await deleteObject(fileRef);
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }
};