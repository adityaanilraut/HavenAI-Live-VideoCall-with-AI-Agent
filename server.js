require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// HeyGen API configuration
const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY || 'heygen_api_key';
const HEYGEN_API_URL = 'https://api.heygen.com/v1';

// WebRTC signaling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  // Store session info for this socket
  let heyGenSessionInfo = null;

  // Handle signaling for WebRTC
  socket.on('offer', (offer, roomId) => {
    socket.to(roomId).emit('offer', offer);
  });

  socket.on('answer', (answer, roomId) => {
    socket.to(roomId).emit('answer', answer);
  });

  socket.on('ice-candidate', (candidate, roomId) => {
    socket.to(roomId).emit('ice-candidate', candidate);
  });

  // Join a room
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  // Handle user message and Gemini AI response
  socket.on('user-message', async (messageData, roomId) => {
    try {
      console.log(`Message from user in room ${roomId}:`, messageData.text);
      
      // Get response from Gemini AI (with image if available)
      let textResponse;
      
      if (messageData.image) {
        // Save image to a file
        const imageFileName = `${Date.now()}_${socket.id}.jpg`;
        const imagePath = path.join(uploadsDir, imageFileName);
        const imageData = messageData.image.replace(/^data:image\/\w+;base64,/, '');
        
        fs.writeFileSync(imagePath, Buffer.from(imageData, 'base64'));
        console.log(`Saved image: ${imagePath}`);
        
        // Use Gemini Pro Vision model with text and image
        const imageUrl = `http://localhost:${process.env.PORT || 3000}/uploads/${imageFileName}`;
        
        // Modified: Add specific instructions for the model to have a conversation and not return JSON
        const userPrompt = `You are an AI assistant in a video chat for emotional Well-being. The user has sent the message: "${messageData.text}" along with an image. Please respond conversationally to the user. Do not return JSON data, bounding boxes, or technical analysis unless specifically asked. be kind and supportive.`;
        
        const result = await geminiModel.generateContent([
          userPrompt,
          { inlineData: { data: imageData, mimeType: 'image/jpeg' } }
        ]);
        
        const response = await result.response;
        textResponse = response.text();
        
        console.log('Gemini response (with image):', textResponse);
      } else {
        // Use regular Gemini model with just text
        const textOnlyModel = genAI.getGenerativeModel({ model: 'gemini-flash' });
        const result = await textOnlyModel.generateContent({
          contents: [{
            role: "user",
            parts: [{ text: messageData.text }]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 800,
          }
        });
        
        const response = await result.response;
        textResponse = response.text();
        
        console.log('Gemini response (text only):', textResponse);
      }
      
      // Generate HeyGen avatar video with the response
      const heyGenResponse = await generateHeyGenVideo(textResponse, socket.id);
      
      // Send the response and HeyGen session info back to the client
      io.to(roomId).emit('ai-response', {
        text: textResponse,
        heyGenSession: heyGenResponse
      });
    } catch (error) {
      console.error('Error processing message:', error);
      socket.emit('error', 'Failed to process your message');
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Close any active HeyGen session
    if (heyGenSessionInfo) {
      closeHeyGenSession(heyGenSessionInfo.session_id)
        .catch(err => console.error('Error closing HeyGen session:', err));
    }
  });
});

// Generate HeyGen avatar streaming session
async function generateHeyGenVideo(text, socketId) {
  try {
    // Get a session token
    const tokenResponse = await axios.post(`${HEYGEN_API_URL}/streaming.create_token`, {}, {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': HEYGEN_API_KEY
      }
    });
    
    const sessionToken = tokenResponse.data.data.token;
    console.log('Obtained HeyGen session token');
    
    // Create a new streaming session with proper configuration
    const sessionResponse = await axios.post(`${HEYGEN_API_URL}/streaming.new`, {
      quality: 'high',
      avatar_name: 'Wayne_20240711', // Default avatar ID, change as needed
      voice: {
        voice_id: '', // Empty for default voice
        rate: 1.0
      },
      version: 'v2', // Use v2 version of the API
      video_encoding: 'H264'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`
      }
    });
    
    const sessionInfo = sessionResponse.data.data;
    console.log('Created HeyGen streaming session:', sessionInfo.session_id);
    
    // Start the streaming session
    await axios.post(`${HEYGEN_API_URL}/streaming.start`, {
      session_id: sessionInfo.session_id
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`
      }
    });
    
    console.log('Started HeyGen streaming session');
    
    // Send the text to the avatar - using talk task type for LLM processing
    await axios.post(`${HEYGEN_API_URL}/streaming.task`, {
      session_id: sessionInfo.session_id,
      text: text,
      task_type: 'repeat' // 'talk' for LLM processing, 'repeat' to make avatar repeat exactly
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`
      }
    });
    
    console.log('Sent text to HeyGen avatar');
    
    // Setup WebSocket for monitoring avatar state (optional)
    // Client side will handle this based on the session info we return
    
    // Return the full session information for the client to connect with LiveKit
    return {
      session_id: sessionInfo.session_id,
      url: sessionInfo.url,
      access_token: sessionInfo.access_token,
      session_token: sessionToken
    };
  } catch (error) {
    console.error('Error setting up HeyGen streaming:', error.response?.data || error.message);
    return null;
  }
}

// Close a HeyGen session
async function closeHeyGenSession(sessionId, sessionToken) {
  try {
    if (!sessionId || !sessionToken) return;
    
    await axios.post(`${HEYGEN_API_URL}/streaming.stop`, {
      session_id: sessionId
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`
      }
    });
    
    console.log('Closed HeyGen streaming session:', sessionId);
  } catch (error) {
    console.error('Error closing HeyGen session:', error.response?.data || error.message);
  }
}

// API routes
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Serve uploaded images
app.get('/uploads/:filename', (req, res) => {
  const filePath = path.join(uploadsDir, req.params.filename);
  res.sendFile(filePath);
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 