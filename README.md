# FluxuryApp 🎤

> A modern rap writing and collaboration platform

FluxuryApp is a web-based application for rap artists to write, edit, and collaborate on lyrics with synchronized beat playback. Built with Vue.js 3 and AWS serverless architecture.

## 🚀 Quick Start

### **Beta Environment Deployment**
Deploy your beta environment to AWS in one command:

```bash
cd fluxury-infra
./scripts/deploy-beta-code.sh
```

This will deploy cost-optimized infrastructure (~$22-60/month) to your AWS account and configure everything for `juantheengineer.com/fluxury`.

### **Local Development**
```bash
# Clone and install
git clone <repository-url>
cd FluxuryApp
npm install

# Run in demo mode (no AWS required)
cd fluxury-app
npm run dev
```

## 📁 Project Structure

```
FluxuryApp/
├── fluxury-app/          # Vue.js frontend application
├── fluxury-infra/        # AWS CDK infrastructure code
├── fluxury-model/        # TypeScript data models
├── fluxury-smithy/       # API schema definitions
├── ARCHITECTURE.md       # System architecture overview
├── SETUP_GUIDE.md        # Detailed setup instructions
├── DEMO_GUIDE.md         # Demo mode documentation
└── COMPONENT_GUIDE.md    # Component documentation
```

## 🎯 Features

- **Rich Text Editor**: Quill.js-based lyrics editor with formatting
- **Beat Synchronization**: Audio playback with timeline seeking
- **Real-time Collaboration**: Share and edit sessions with others
- **Cloud Storage**: AWS S3 integration for beats and sessions
- **User Authentication**: AWS Cognito user management
- **Mobile Responsive**: Works on desktop and mobile devices

## 🏗️ Architecture

- **Frontend**: Vue.js 3 + TypeScript + Vite + TailwindCSS
- **Backend**: AWS Lambda + API Gateway + DynamoDB
- **Storage**: AWS S3 for file storage
- **Authentication**: AWS Cognito
- **Infrastructure**: AWS CDK for Infrastructure as Code

## 📖 Documentation

- [**Setup Guide**](./SETUP_GUIDE.md) - Complete setup instructions
- [**Architecture Overview**](./ARCHITECTURE.md) - System design and components
- [**Component Guide**](./COMPONENT_GUIDE.md) - Frontend component documentation
- [**Demo Guide**](./DEMO_GUIDE.md) - Running demo mode locally

## 🎮 Demo Mode

Try FluxuryApp locally without AWS:

```bash
cd fluxury-app
cp .env.demo .env.local
npm run dev
```

Demo mode includes:
- Realistic mock data with sample rap sessions
- Local file system storage simulation
- No AWS account required
- Perfect for development and testing

## 🌐 Deployment Options

### **Beta Environment** (Recommended for testing)
- Cost-optimized AWS infrastructure
- Auto-cleanup after 90 days
- Perfect for user testing and feedback
- ~$22-60/month

### **Production Environment**
- Full production-ready infrastructure
- Advanced monitoring and security
- Custom domain support
- See [Production Launch Checklist](./PRODUCTION_LAUNCH_CHECKLIST.md)

## 🛠️ Development

```bash
# Install dependencies
npm install

# Start frontend development server
cd fluxury-app
npm run dev

# Build for production
npm run build

# Deploy infrastructure
cd fluxury-infra
npm run deploy:beta
```

## 📊 Tech Stack

- **Vue.js 3** - Progressive JavaScript framework
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool and dev server
- **TailwindCSS** - Utility-first CSS framework
- **Quill.js** - Rich text editor
- **Howler.js** - Audio playback library
- **AWS CDK** - Infrastructure as Code
- **AWS Lambda** - Serverless compute
- **DynamoDB** - NoSQL database
- **S3** - Object storage
- **Cognito** - User authentication

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test in demo mode
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) for details

## 🆘 Support

- [Setup Issues](./SETUP_GUIDE.md#troubleshooting)
- [Component Documentation](./COMPONENT_GUIDE.md)
- [Architecture Questions](./ARCHITECTURE.md)

---

**Live Beta**: [juantheengineer.com/fluxury](https://juantheengineer.com/fluxury)