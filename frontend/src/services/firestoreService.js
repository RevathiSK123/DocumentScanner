import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc,
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';

export const firestoreService = {
  async createDocument(userId, fileData) {
    try {
      const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const documentData = {
        id: docId,
        userId: userId,
        filename: fileData.name,
        fileType: fileData.type,
        fileSize: fileData.size,
        status: 'uploading',
        uploadedAt: serverTimestamp(),
        originalUrl: '',
        originalPath: '',
        processedUrl: '',
        processedPath: '',
        processingError: null,
        metadata: {
          width: fileData.width || null,
          height: fileData.height || null,
          pages: fileData.pages || 1
        }
      };
      
      await setDoc(doc(db, 'documents', docId), documentData);
      return docId;
      
    } catch (error) {
      console.error('Error creating document:', error);
      throw error;
    }
  },
  
  async updateDocumentWithUrl(docId, updateData) {
    try {
      await updateDoc(doc(db, 'documents', docId), {
        ...updateData,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating document:', error);
      throw error;
    }
  },
  
  async getUserDocuments(userId) {
    try {
      const q = query(
        collection(db, 'documents'),
        where('userId', '==', userId),
        orderBy('uploadedAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const documents = [];
      
      querySnapshot.forEach((docSnapshot) => {
        documents.push({
          id: docSnapshot.id,
          ...docSnapshot.data()
        });
      });
      
      return documents;
    } catch (error) {
      console.error('Error fetching documents:', error);
      throw error;
    }
  },
  
  async getDocument(docId, userId) {
    try {
      const docRef = doc(db, 'documents', docId);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        throw new Error('Document not found');
      }
      
      const data = docSnap.data();
      
      // Security check
      if (data.userId !== userId) {
        throw new Error('Unauthorized access');
      }
      
      return {
        id: docSnap.id,
        ...data
      };
    } catch (error) {
      console.error('Error getting document:', error);
      throw error;
    }
  }
};