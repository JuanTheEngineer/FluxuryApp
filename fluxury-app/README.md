# 🎧 Fluxury App

Fluxury is a streamlined web application tailored to assist in creating, organizing, and managing rap lyrics and audio beats efficiently. Built with simplicity, responsiveness, and ease of use in mind, Fluxury provides precise audio playback controls combined with a seamless text editing experience optimized for both desktop and mobile devices.

## 📦 Project Structure

- `fluxury-app/`: Frontend Vue.js application built with Vite, TailwindCSS, Vue Router, and Pinia.
- `fluxury-infra/`: AWS CDK Infrastructure setup (Lambda, DynamoDB, API Gateway, S3).

---

## 🚀 Getting Started

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd fluxury-app
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the Development Server

```bash
npm run dev
```

Open the application in your browser:
```
http://localhost:5173
```

---

## 🛠️ Tech Stack

**Frontend**:
- Vue.js 3 + Vite
- Vue Router
- Pinia for state management
- TailwindCSS for styling
- Axios for API requests

**Backend** (Next Phase):
- AWS Lambda
- AWS DynamoDB
- AWS S3
- AWS API Gateway
- AWS CDK (Infrastructure as Code)

---

## 📂 Directory Layout

```
fluxury-app/
├── public/                  # Static files and entry point
├── src/
│   ├── assets/              # Images and other static resources
│   ├── components/          # Reusable UI components
│   ├── router/              # App routing configuration
│   ├── services/            # API interactions and services
│   ├── stores/              # State management (Pinia)
│   ├── views/               # Application views/pages
│   ├── App.vue              # Root component
│   ├── main.ts              # Entry point for Vue application
│   └── style.css            # Global Tailwind CSS imports
├── package.json
├── tailwind.config.js
├── vite.config.ts
└── tsconfig.json
```

---

## 📌 Next Steps

- Set up AWS infrastructure using AWS CDK.
- Integrate frontend with backend APIs for beat management.
- Implement rich text editor and advanced audio controls.

---

## 📝 Contributing

To contribute, please create a feature branch and submit a pull request.

---

**Happy rapping with Fluxury! 🎤🎶**

## Project setup
```
npm install
```

### Compiles and hot-reloads for development
```
npm run serve
```

### Compiles and minifies for production
```
npm run build
```

### Lints and fixes files
```
npm run lint
```

### Customize configuration
See [Configuration Reference](https://cli.vuejs.org/config/).
