# Enduroco Workout Sync to COROS / TrainingPeaks

This project automates syncing planned workouts from [Enduroco](https://www.enduroco.in/dashboard) to your **COROS Training Calendar**, with fallback or direct pass-through via **TrainingPeaks**.

---

## 🎯 Architecture & Synchronization Flow

```
[ Enduroco Dashboard ]
       │
       ├── (1) Direct Sync via COROS Training Hub API (Unofficial endpoints)
       │       └──> [ COROS Training Hub Calendar ] ──> [ COROS Watch ]
       │
       └── (2) Seamless Bridge via TrainingPeaks
               ├── Enduroco pushes workouts to TrainingPeaks
               └── COROS automatically syncs daily workouts from TrainingPeaks ──> [ COROS Watch ]
```

---

## 🚀 Recommended Direct Integration (Zero-Code Method)

Enduroco already has a direct official integration with **TrainingPeaks**, and COROS natively connects to **TrainingPeaks**:

1. **Connect Enduroco to TrainingPeaks**:
   - Open [Enduroco Dashboard](https://www.enduroco.in/dashboard) -> **Settings** -> **Connected Apps**.
   - Under **Device Management**, toggle **TrainingPeaks** to authorize.
2. **Connect COROS to TrainingPeaks**:
   - Open the **COROS App** on your phone -> **Profile** (`Shield` icon) -> **Third-party Apps** -> **TrainingPeaks** -> Log in.
3. **Result**:
   - Every planned workout created on Enduroco automatically syncs to TrainingPeaks, which instantly pushes structured workout steps to your COROS watch calendar!

---

## 💻 Automated Script Method (Node.js & Python)

If you wish to run automated sync via script:

### 1. Setup Environment Variables

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Fill in your configuration:
- `ENDUROCO_AUTH_TOKEN`: Your Enduroco session token (or leave blank to use interactive browser sign-in).
- `COROS_EMAIL` & `COROS_PASSWORD`: Your COROS Training Hub credentials.
- `TRAININGPEAKS_ACCESS_TOKEN`: (Optional) Your TrainingPeaks token.

### 2. Running with Node.js
```bash
npm install
npm start
```

### 3. Running with Python
```bash
pip install -r requirements.txt
python sync.py
```
