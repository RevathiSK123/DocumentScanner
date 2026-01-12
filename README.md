# DocumentScanner

A web application and toolkit for scanning, cropping, enhancing, and managing documents using modern frontend, serverless backend, and Python prototyping. Supports auto-cropping, perspective correction, OCR, and integration with Firebase for storage and authentication.

## Features

- 📄 Upload and scan documents (images)
- ✂️ Auto-crop and perspective correction
- 🌑 Grayscale and enhancement filters
- 🔍 OCR (text extraction)
- 🖼️ Document gallery and preview
- 🔒 User authentication (Firebase)
- ☁️ Cloud storage (Firebase Storage)
- 📊 Document management (Firestore)
- 🖥️ Responsive frontend (React)
- 🔥 Serverless backend (Firebase Functions, Node.js)
- 🐍 Python prototyping and batch processing (Jupyter notebook)

## Project Structure

```
.
├── frontend/                # React frontend app
│   ├── src/
│   └── public/
├── functions/               # Firebase Cloud Functions (Node.js)
├── firebase-config/         # Firebase config files
├── cropped_results/         # Output images (optional)
├── test_images/             # Sample images for testing
├── test_scanner.ipynb       # Jupyter notebook for Python prototyping
├── firebase.json            # Firebase project config
├── firestore.rules          # Firestore security rules
├── storage.rules            # Storage security rules
└── README.md
```

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- npm or yarn
- Firebase CLI (`npm install -g firebase-tools`)
- Python 3.8+ (for Jupyter notebook)
- pip (Python package manager)

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/DocumentScanner.git
   cd DocumentScanner
   ```

2. **Install dependencies:**
   - Frontend:
     ```bash
     cd frontend
     npm install
     ```
   - Functions:
     ```bash
     cd ../functions
     npm install
     ```
   - Python (for Jupyter notebook):
     ```bash
     pip install -r requirements.txt
     # or install manually:
     pip install opencv-python numpy matplotlib jupyter
     ```

3. **Firebase setup:**
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Copy your Firebase config to `frontend/src/firebase.js` and `firebase-config/firebaseConfig.js`
   - Initialize Firebase in the root folder:
     ```bash
     firebase init
     ```

4. **Set up environment variables (if needed):**
   - Add your Firebase API keys and config to the appropriate files.

### Running Locally

- **Frontend:**
  ```bash
  cd frontend
  npm start
  ```
- **Backend (Cloud Functions, emulated):**
  ```bash
  cd functions
  firebase emulators:start
  ```
- **Python/Jupyter Notebook:**
  ```bash
  jupyter notebook test_scanner.ipynb
  ```

### Deployment

- Deploy to Firebase Hosting and Functions:
  ```bash
  firebase deploy
  ```


## Python Implementation (Jupyter Notebook)

The `test_scanner.ipynb` notebook provides a reference implementation of document detection, cropping, and enhancement using OpenCV and Python. Use it for:
- Prototyping new algorithms
- Batch processing test images
- Visualizing edge/crop detection
- Comparing results with the web app

**Requirements:**
- Python 3.8+
- opencv-python
- numpy
- matplotlib
- jupyter

**Run the notebook:**
```bash
jupyter notebook test_scanner.ipynb
```

### Example Results from Python Notebook

#### Document Detection and Cropping

<p align="center">
  <img src="screenshots/python_rotated_document.png" alt="Rotated Document Detection" width="100%">
</p>

<p align="center">
  <img src="screenshots/python_idcard_document.png" alt="ID Card Document Detection" width="100%">
</p>

#### Test Images Used in Notebook

<p align="center">
  <img src="screenshots/python_test_images.png" alt="Test Images" width="70%">
</p>

## Usage

1. Register or log in with your Firebase account.
2. Upload a document image.
3. The app will auto-crop, enhance, and show the scanned result.
4. Download, preview, or extract text from your documents.
5. Manage your scanned documents in the gallery.
6. Use the Jupyter notebook for advanced prototyping or batch processing.

## Contributing

Contributions are welcome! Please open issues or pull requests for improvements or bug fixes.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/YourFeature`)
3. Commit your changes (`git commit -am 'Add new feature'`)
4. Push to the branch (`git push origin feature/YourFeature`)
5. Open a pull request

## License

This project is licensed under the MIT License.

---

Feel free to add screenshots, API documentation, or troubleshooting tips as needed!
