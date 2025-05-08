# Setup Guide for Gemini-HeyGen Video Chat

This guide will walk you through the process of setting up the Gemini-HeyGen Video Chat application, including obtaining the necessary API keys.

## Prerequisites

- Node.js (v14 or higher) and npm installed
- A Google Cloud account for Gemini API
- A HeyGen account for the AI avatar generation

## Step 1: Clone and Install Dependencies

1. Clone the repository:
   ```
   git clone <repository-url>
   cd gemini-heygen-video-chat
   ```

2. Install dependencies:
   ```
   npm install
   ```

## Step 2: Get a Google Gemini API Key

1. Go to the [Google AI Studio](https://makersuite.google.com/app/apikey) website
2. Sign in with your Google account
3. Click on "Get API key" and follow the instructions
4. Copy the API key for later use

## Step 3: Get a HeyGen API Key

1. Create an account on [HeyGen](https://www.heygen.com/)
2. Go to their Developer Portal or API section (typically found in account settings)
3. Request or generate an API key
4. Copy the API key for later use

## Step 4: Configure Environment Variables

1. Create a `.env` file in the root directory of the project:
   ```
   touch .env
   ```

2. Add your API keys to the `.env` file:
   ```
   GEMINI_API_KEY=your_gemini_api_key_here
   HEYGEN_API_KEY=your_heygen_api_key_here
   PORT=3000
   ```

## Step 5: Start the Application

1. Start the server:
   ```
   npm run dev
   ```

2. In a separate terminal, start the client:
   ```
   npm run client
   ```

3. Open your browser and navigate to `http://localhost:1234`

## Using the Application

1. Click "Start Call" to initialize your camera and microphone
2. Speak into your microphone or type messages in the chat box
3. Your voice will be converted to text and sent to Gemini AI
4. Gemini's response will be rendered as a HeyGen AI avatar video
5. Enjoy your conversation with the AI!

## Troubleshooting

- **Camera or Microphone Access Issues**: Make sure you've granted the necessary permissions in your browser
- **API Key Errors**: Verify that your API keys are correctly entered in the `.env` file
- **Video Playback Issues**: Ensure your browser supports the video codecs used by HeyGen

## Additional Resources

- [Google Gemini AI Documentation](https://ai.google.dev/docs)
- [HeyGen API Documentation](https://docs.heygen.com/)
- [WebRTC Documentation](https://webrtc.org/getting-started/overview)

## Support

If you encounter any issues or have questions, please file an issue in the repository. 