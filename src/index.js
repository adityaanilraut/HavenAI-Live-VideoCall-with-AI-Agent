// Import socket.io client
import io from 'socket.io-client';
import adapter from 'webrtc-adapter';

// DOM elements
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const micBtn = document.getElementById('mic-btn');
const videoBtn = document.getElementById('video-btn');
const startCallBtn = document.getElementById('start-call-btn');
const endCallBtn = document.getElementById('end-call-btn');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const voiceBtn = document.getElementById('voice-btn');
const conversationContainer = document.getElementById('conversation-container');
const clearChatBtn = document.getElementById('clear-chat-btn');
const statusContainer = document.getElementById('status-container');
const avatarIDInput = document.getElementById('avatarID');
const voiceIDInput = document.getElementById('voiceID');
//const talkBtn = document.getElementById('talk-btn');
const repeatBtn = document.getElementById('repeat-btn');

// WebRTC configuration
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Global variables
let socket;
let localStream;
let peerConnection;
let roomId;
let micActive = true;
let videoActive = true;
let recognition;
let chatHistory = [];
let lastFrameData = null;
let lastGeminiResponse = ''; // Store the last Gemini response

// HeyGen API configuration
const HEYGEN_API_CONFIG = {
  apiKey: "heygen_api_key",
  serverUrl: "https://api.heygen.com"
};

// HeyGen streaming variables
let heyGenSessionInfo = null;
let heyGenRoom = null;
let heyGenMediaStream = null;
let heyGenWebSocket = null;
let heyGenSessionToken = null;

// Initialize Speech Recognition
function initSpeechRecognition() {
  if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    let finalTranscript = '';
    let silenceTimer = null;
    const silenceTimeout = 2000; // 2 seconds of silence before sending
    
    recognition.onstart = () => {
      console.log('Speech recognition started');
      messageInput.placeholder = 'Listening...';
      voiceBtn.classList.add('recording');
    };
    
    recognition.onresult = (event) => {
      let interimTranscript = '';
      
      // Clear the silence timer on new speech
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
      
      // Process the results
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }
      
      // Update the input field with current transcription
      messageInput.value = finalTranscript + interimTranscript;
      
      // Start silence detection timer when speech pauses
      silenceTimer = setTimeout(() => {
        if (finalTranscript.trim()) {
          console.log('Silence detected, sending message:', finalTranscript);
          messageInput.value = finalTranscript.trim();
          sendMessage();
          finalTranscript = '';
          interimTranscript = '';
        }
      }, silenceTimeout);
    };
    
    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      messageInput.placeholder = 'Type a message or speak...';
      voiceBtn.classList.remove('recording');
      
      // No longer auto-restart on error
    };
    
    recognition.onend = () => {
      console.log('Speech recognition ended');
      messageInput.placeholder = 'Type a message or speak...';
      voiceBtn.classList.remove('recording');
      
      // No longer auto-restart
    };
    
    // No longer auto-start continuous listening
  } else {
    console.error('Speech recognition not supported in this browser');
    voiceBtn.disabled = true;
  }
}

// Start continuous listening
function startContinuousListening() {
  try {
    if (recognition) {
      recognition.start();
    }
  } catch (error) {
    console.error('Error starting speech recognition:', error);
  }
}

// Stop continuous listening
function stopContinuousListening() {
  try {
    if (recognition) {
      recognition.stop();
    }
  } catch (error) {
    console.error('Error stopping speech recognition:', error);
  }
}

// Initialize the application
async function init() {
  try {
    // Connect to the server
    socket = io('http://localhost:3000');
    setupSocketListeners();
    
    // Initialize speech recognition
    initSpeechRecognition();
    
    // Set up event listeners
    setupEventListeners();
    
    // Generate a unique room ID
    roomId = generateRoomId();
    console.log('Room ID:', roomId);
    
    // Load chat history from localStorage
    loadChatHistory();
    
    // Disable end call button initially
    endCallBtn.disabled = true;
    
    // Create clear chat button if it doesn't exist
    if (!clearChatBtn) {
      createClearChatButton();
    }
    
  } catch (error) {
    console.error('Initialization error:', error);
  }
}

// Set up socket listeners
function setupSocketListeners() {
  socket.on('connect', () => {
    console.log('Connected to server');
  });
  
  // Handle signaling for WebRTC
  socket.on('offer', async (offer) => {
    console.log('Received offer');
    try {
      if (!peerConnection) {
        await createPeerConnection();
      }
      
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      socket.emit('answer', answer, roomId);
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  });
  
  socket.on('answer', async (answer) => {
    console.log('Received answer');
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  });
  
  socket.on('ice-candidate', async (candidate) => {
    console.log('Received ICE candidate');
    try {
      if (candidate && peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  });
  
  socket.on('ai-response', async (response) => {
    console.log('Received AI response:', response);
    
    // Add AI message to conversation
    addMessage(response.text, 'ai');
    
    // Store the Gemini response for repeat button
    lastGeminiResponse = response.text;
    
    // Handle HeyGen session if provided
    if (response.heyGenSession) {
      // Use the session info from the server
      await setupHeyGenStreaming(response.heyGenSession);
      updateStatus('Connected to HeyGen avatar');
    } else {
      // Automatically repeat the Gemini response with the avatar
      try {
        // If no active session, create one
        if (!heyGenSessionInfo) {
          await createHeyGenSession();
        }
        
        // Pause microphone if active
        if (recognition && recognition.state === 'active') {
          stopContinuousListening();
        }
        
        // Send Gemini text to HeyGen using only 'repeat' mode
        await sendTextToHeyGen(response.text, 'repeat');
        
        // Resume microphone if it was active
        if (micActive) {
          startContinuousListening();
        }
      } catch (error) {
        console.error('Error auto-repeating Gemini response:', error);
        updateStatus('Error: Failed to auto-repeat Gemini response');
      }
    }
  });
  
  socket.on('error', (message) => {
    console.error('Server error:', message);
    alert(`Error: ${message}`);
  });
}

// Set up event listeners for UI elements
function setupEventListeners() {
  // Start call button
  startCallBtn.addEventListener('click', startCall);
  
  // End call button
  endCallBtn.addEventListener('click', endCall);
  
  // Mic button
  micBtn.addEventListener('click', toggleMic);
  
  // Video button
  videoBtn.addEventListener('click', toggleVideo);
  
  // Send message button
  sendBtn.addEventListener('click', sendMessage);
  
  // Message input (send on Enter key)
  messageInput.addEventListener('keyup', (event) => {
    if (event.key === 'Enter') {
      sendMessage();
    }
  });
  
  // Voice input button - now toggles continuous listening
  voiceBtn.addEventListener('click', toggleContinuousListening);
  
  // Comment out LLM Talk button
  /* 
  talkBtn.addEventListener('click', () => {
    if (lastGeminiResponse) {
      handleLLMTalk(lastGeminiResponse, 'talk');
    } else {
      updateStatus('No Gemini response to use');
    }
  });
  */
  
  // Keep Repeat button functionality
  repeatBtn.addEventListener('click', () => {
    if (lastGeminiResponse) {
      handleRepeat(lastGeminiResponse);
    } else {
      updateStatus('No Gemini response to repeat');
    }
  });
}

// Create a WebRTC peer connection
async function createPeerConnection() {
  try {
    peerConnection = new RTCPeerConnection(configuration);
    
    // Add local stream tracks to peer connection
    if (localStream) {
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
    }
    
    // Set up ICE candidate handling
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', event.candidate, roomId);
      }
    };
    
    // Set up remote stream handling
    peerConnection.ontrack = (event) => {
      remoteVideo.srcObject = event.streams[0];
    };
    
    console.log('Peer connection created');
  } catch (error) {
    console.error('Error creating peer connection:', error);
  }
}

// Start the call
async function startCall() {
  try {
    // Get user media (camera and microphone)
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true
      },
      //audio: true,
      video: true
    });
    
    // Display local video
    localVideo.srcObject = localStream;
    
    // Create peer connection
    await createPeerConnection();
    
    // Join room
    socket.emit('join-room', roomId);
    
    // Create and send offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', offer, roomId);
    
    // Update UI
    startCallBtn.disabled = true;
    endCallBtn.disabled = false;
    
    console.log('Call started');
  } catch (error) {
    console.error('Error starting call:', error);
  }
}

// End the call
function endCall() {
  try {
    // Stop local stream tracks
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    // Close peer connection
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    
    // Close HeyGen session
    closeHeyGenSession();
    
    // Clear video elements
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    
    // Update UI
    startCallBtn.disabled = false;
    endCallBtn.disabled = true;
    
    console.log('Call ended');
  } catch (error) {
    console.error('Error ending call:', error);
  }
}

// Toggle microphone
function toggleMic() {
  if (localStream) {
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length > 0) {
      const enabled = !audioTracks[0].enabled;
      audioTracks[0].enabled = enabled;
      micActive = enabled;
      
      // Update UI
      micBtn.classList.toggle('muted', !enabled);
    }
  }
}

// Toggle video
function toggleVideo() {
  if (localStream) {
    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length > 0) {
      const enabled = !videoTracks[0].enabled;
      videoTracks[0].enabled = enabled;
      videoActive = enabled;
      
      // Update UI
      videoBtn.classList.toggle('video-off', !enabled);
    }
  }
}

// Capture frame from video element
function captureVideoFrame(videoElement) {
  return new Promise((resolve, reject) => {
    try {
      // Create canvas with same dimensions as video
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      const width = videoElement.videoWidth;
      const height = videoElement.videoHeight;
      
      // Set canvas dimensions to match video
      canvas.width = width;
      canvas.height = height;
      
      // Draw current video frame to canvas
      context.drawImage(videoElement, 0, 0, width, height);
      
      // Convert canvas to data URL (JPEG format with 90% quality)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      
      resolve(dataUrl);
    } catch (error) {
      console.error('Error capturing video frame:', error);
      reject(error);
    }
  });
}

// Send message to Gemini AI
async function sendMessage() {
  const message = messageInput.value.trim();
  if (message) {
    try {
      // Add user message to conversation
      addMessage(message, 'user');
      
      // Capture frame from local video if available
      let imageData = null;
      if (localStream && localVideo.srcObject) {
        imageData = await captureVideoFrame(localVideo);
        console.log("Captured video frame for message");
        
        // Save this as the last frame
        saveLastFrame(imageData);
      }
      
      // Send message and image data to server
      socket.emit('user-message', {
        text: message,
        image: imageData
      }, roomId);
      
      // Clear input
      messageInput.value = '';
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }
}

// Toggle continuous listening
function toggleContinuousListening() {
  if (recognition) {
    if (voiceBtn.classList.contains('recording')) {
      stopContinuousListening();
      voiceBtn.classList.remove('recording');
    } else {
      startContinuousListening();
      voiceBtn.classList.add('recording');
    }
  }
}

// No longer needed since we start listening automatically
function startVoiceInput() {
  toggleContinuousListening();
}

// Add message to conversation container
function addMessage(message, sender) {
  // Create message object and add to history
  const messageObj = {
    message: message,
    sender: sender,
    timestamp: new Date().toISOString()
  };
  
  // Add to chat history array
  chatHistory.push(messageObj);
  
  // Save to localStorage
  saveChatHistory();
  
  // Display the message
  displayMessage(message, sender);
}

// Display a message in the conversation container
function displayMessage(message, sender) {
  const messageElement = document.createElement('div');
  messageElement.classList.add('message');
  messageElement.classList.add(sender === 'user' ? 'user-message' : 'ai-message');
  messageElement.textContent = message;
  
  conversationContainer.appendChild(messageElement);
  conversationContainer.scrollTop = conversationContainer.scrollHeight;
}

// Generate a random room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 15);
}

// Load chat history from localStorage
function loadChatHistory() {
  try {
    const savedHistory = localStorage.getItem('chatHistory');
    if (savedHistory) {
      chatHistory = JSON.parse(savedHistory);
      
      // Display loaded messages
      chatHistory.forEach(item => {
        displayMessage(item.message, item.sender);
      });
    }
    
    // Still load last frame if available but don't display it
    const savedFrame = localStorage.getItem('lastFrame');
    if (savedFrame) {
      lastFrameData = savedFrame;
    }
  } catch (error) {
    console.error('Error loading chat history:', error);
    // Reset if there's an error parsing
    chatHistory = [];
    localStorage.removeItem('chatHistory');
  }
}

// Save chat history to localStorage
function saveChatHistory() {
  try {
    localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
  } catch (error) {
    console.error('Error saving chat history:', error);
  }
}

// Save the last frame to localStorage
function saveLastFrame(frameData) {
  try {
    lastFrameData = frameData;
    localStorage.setItem('lastFrame', frameData);
  } catch (error) {
    console.error('Error saving last frame:', error);
  }
}

// Create clear chat button
function createClearChatButton() {
  const clearBtn = document.createElement('button');
  clearBtn.id = 'clear-chat-btn';
  clearBtn.className = 'action-btn';
  clearBtn.textContent = 'Clear Chat';
  clearBtn.addEventListener('click', clearChatHistory);
  
  // Find the appropriate container to add the button
  const messageInputContainer = document.querySelector('.message-input');
  if (messageInputContainer) {
    messageInputContainer.appendChild(clearBtn);
  } else {
    // Alternative: add after send button
    const sendButton = document.getElementById('send-btn');
    if (sendButton && sendButton.parentNode) {
      sendButton.parentNode.appendChild(clearBtn);
    }
  }
}

// Clear chat history
function clearChatHistory() {
  // Clear the chat history array
  chatHistory = [];
  
  // Remove from localStorage
  localStorage.removeItem('chatHistory');
  localStorage.removeItem('lastFrame');
  lastFrameData = null;
  
  // Clear the conversation container
  conversationContainer.innerHTML = '';
  
  // Remove the last frame display if it exists
  const frameContainer = document.querySelector('.last-frame-container');
  if (frameContainer) {
    frameContainer.remove();
  }
}

// Empty placeholder function to maintain compatibility with existing code
function displayLastFrame() {
  // Intentionally empty - not displaying the last frame
}

// Setup HeyGen streaming with LiveKit
async function setupHeyGenStreaming(sessionInfo) {
  try {
    // Store session info globally
    heyGenSessionInfo = sessionInfo;
    heyGenSessionToken = sessionInfo.session_token;
    
    // Load LiveKit client if not already loaded
    if (!window.LivekitClient) {
      await loadLiveKitScript();
    }
    
    // Create LiveKit Room with proper configuration
    heyGenRoom = new LivekitClient.Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: LivekitClient.VideoPresets.h720.resolution,
      },
    });
    
    // Setup all room events
    setupHeyGenRoomEvents();
    
    // Prepare connection
    await heyGenRoom.prepareConnection(sessionInfo.url, sessionInfo.access_token);
    console.log('HeyGen connection prepared');
    
    // Connect WebSocket for monitoring avatar state
    await connectHeyGenWebSocket(sessionInfo.session_id);
    
    // Connect to LiveKit room
    await heyGenRoom.connect(sessionInfo.url, sessionInfo.access_token);
    console.log('Connected to HeyGen room');
    
    updateStatus('HeyGen avatar ready');
    
  } catch (error) {
    console.error('Error setting up HeyGen streaming:', error);
    updateStatus('Error setting up avatar streaming');
  }
}

// Connect to HeyGen WebSocket for monitoring
async function connectHeyGenWebSocket(sessionId) {
  try {
    // Close existing WebSocket if any
    if (heyGenWebSocket && heyGenWebSocket.readyState === WebSocket.OPEN) {
      heyGenWebSocket.close();
    }
    
    // Setup WebSocket parameters
    const params = new URLSearchParams({
      session_id: sessionId,
      session_token: heyGenSessionToken,
      silence_response: false,
    });
    
    const wsUrl = `wss://${new URL(HEYGEN_API_CONFIG.serverUrl).hostname}/v1/ws/streaming.chat?${params}`;
    heyGenWebSocket = new WebSocket(wsUrl);
    
    // WebSocket event handlers
    heyGenWebSocket.addEventListener('open', () => {
      console.log('HeyGen WebSocket connected');
      updateStatus('Avatar monitoring connected');
    });
    
    heyGenWebSocket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('HeyGen WebSocket event:', data);
        
        // Handle specific avatar events
        if (data.event === 'speech_start') {
          updateStatus('Avatar speaking...');
        } else if (data.event === 'speech_end') {
          updateStatus('Avatar finished speaking');
        } else if (data.event === 'error') {
          updateStatus(`Avatar error: ${data.message || 'Unknown error'}`);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });
    
    heyGenWebSocket.addEventListener('close', () => {
      console.log('HeyGen WebSocket closed');
    });
    
    heyGenWebSocket.addEventListener('error', (error) => {
      console.error('HeyGen WebSocket error:', error);
    });
    
  } catch (error) {
    console.error('Error connecting to HeyGen WebSocket:', error);
  }
}

// Setup HeyGen room events
function setupHeyGenRoomEvents() {
  // Data events for room messages
  heyGenRoom.on(LivekitClient.RoomEvent.DataReceived, (message) => {
    const data = new TextDecoder().decode(message);
    console.log('Room message:', JSON.parse(data));
  });
  
  // Handle media streams
  heyGenMediaStream = new MediaStream();
  
  // Track subscription - when we get video/audio from the server
  heyGenRoom.on(LivekitClient.RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === 'video' || track.kind === 'audio') {
      heyGenMediaStream.addTrack(track.mediaStreamTrack);
      
      // When we have both video and audio tracks, attach to video element
      if (heyGenMediaStream.getVideoTracks().length > 0 && 
          heyGenMediaStream.getAudioTracks().length > 0) {
        remoteVideo.srcObject = heyGenMediaStream;
        updateStatus('Avatar video stream connected');
        
        // Capture frame when video loads
        remoteVideo.addEventListener('loadeddata', function captureFrameOnce() {
          remoteVideo.removeEventListener('loadeddata', captureFrameOnce);
          
          // Wait a moment to ensure video has rendered
          setTimeout(async () => {
            try {
              const frameData = await captureVideoFrame(remoteVideo);
              saveLastFrame(frameData);
            } catch (error) {
              console.error('Error capturing frame:', error);
            }
          }, 1000);
        });
      }
    }
  });
  
  // Handle track unsubscribe
  heyGenRoom.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track) => {
    const mediaTrack = track.mediaStreamTrack;
    if (mediaTrack) {
      heyGenMediaStream.removeTrack(mediaTrack);
    }
  });
  
  // Handle connection state changes
  heyGenRoom.on(LivekitClient.RoomEvent.Disconnected, (reason) => {
    updateStatus(`Room disconnected: ${reason}`);
  });
  
  heyGenRoom.on(LivekitClient.RoomEvent.Connected, () => {
    updateStatus('Connected to avatar streaming room');
  });
  
  heyGenRoom.on(LivekitClient.RoomEvent.Reconnecting, () => {
    updateStatus('Reconnecting to avatar streaming...');
  });
  
  heyGenRoom.on(LivekitClient.RoomEvent.Reconnected, () => {
    updateStatus('Reconnected to avatar streaming');
  });
}

// Close HeyGen streaming
function closeHeyGenStreaming() {
  try {
    // Disconnect from LiveKit room
    if (heyGenRoom) {
      heyGenRoom.disconnect();
      heyGenRoom = null;
    }
    
    // Clear MediaStream
    if (heyGenMediaStream) {
      heyGenMediaStream.getTracks().forEach(track => track.stop());
      heyGenMediaStream = null;
    }
    
    // Clear video element
    if (remoteVideo.srcObject) {
      remoteVideo.srcObject = null;
    }
    
    // Clear session info
    heyGenSessionInfo = null;
    
    console.log('HeyGen streaming closed');
  } catch (error) {
    console.error('Error closing HeyGen streaming:', error);
  }
}

// Load LiveKit client script
function loadLiveKitScript() {
  return new Promise((resolve, reject) => {
    if (window.LivekitClient) {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.umd.min.js';
    script.onload = () => {
      console.log('LiveKit client loaded');
      resolve();
    };
    script.onerror = () => {
      console.error('Failed to load LiveKit client');
      reject(new Error('Failed to load LiveKit client'));
    };
    document.head.appendChild(script);
  });
}

// Update status in the status container
function updateStatus(message) {
  const timestamp = new Date().toLocaleTimeString();
  const statusMessage = `[${timestamp}] ${message}`;
  
  if (statusContainer) {
    statusContainer.innerHTML += statusMessage + '<br>';
    statusContainer.scrollTop = statusContainer.scrollHeight;
  }
  console.log(statusMessage);
}

// Comment out handleLLMTalk function (keeping for reference)
/*
async function handleLLMTalk(text, taskType = 'talk') {
  try {
    // If no active session, create one
    if (!heyGenSessionInfo) {
      await createHeyGenSession();
    }
    
    // Send text to HeyGen
    await sendTextToHeyGen(text, taskType);
  } catch (error) {
    console.error('Error handling LLM talk:', error);
    updateStatus('Error: Failed to send text to HeyGen');
  }
}
*/

// Add dedicated function for handling repeat
async function handleRepeat(text) {
  try {
    // If no active session, create one
    if (!heyGenSessionInfo) {
      await createHeyGenSession();
    }
    
    // Always use 'repeat' task type
    updateStatus('Repeating last response...');
    
    // Pause microphone while avatar is speaking
    if (recognition && recognition.state === 'active') {
      stopContinuousListening();
    }
    
    // Send text and wait for avatar to finish speaking
    await sendTextToHeyGen(text, 'repeat');
    
    // If voice recognition was active before, restart it
    if (micActive) {
      startContinuousListening();
    }
  } catch (error) {
    console.error('Error handling repeat:', error);
    updateStatus('Error: Failed to repeat text');
    
    // Restart microphone if it was active
    if (micActive) {
      startContinuousListening();
    }
  }
}

// Create HeyGen session with specific avatar settings
async function createHeyGenSession() {
  try {
    updateStatus('Creating HeyGen session...');
    
    // Get session token if not available
    if (!heyGenSessionToken) {
      await getHeyGenSessionToken();
    }
    
    // Create a new streaming session
    const response = await fetch(`${HEYGEN_API_CONFIG.serverUrl}/v1/streaming.new`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${heyGenSessionToken}`
      },
      body: JSON.stringify({
        quality: 'high',
        avatar_name: avatarIDInput.value || 'Wayne_20240711',
        voice: {
          voice_id: voiceIDInput.value || '',
          rate: 1.0
        },
        version: 'v2',
        video_encoding: 'H264'
      })
    });
    
    const data = await response.json();
    heyGenSessionInfo = data.data;
    updateStatus('HeyGen session created for avatar: ' + (avatarIDInput.value || 'Wayne_20240711'));
    
    // Create LiveKit Room
    heyGenRoom = new LivekitClient.Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: LivekitClient.VideoPresets.h720.resolution
      }
    });
    
    // Handle room events
    setupHeyGenRoomEvents();
    
    // Prepare connection
    await heyGenRoom.prepareConnection(heyGenSessionInfo.url, heyGenSessionInfo.access_token);
    updateStatus('Connection prepared');
    
    // Connect WebSocket
    await connectHeyGenWebSocket(heyGenSessionInfo.session_id);
    
    // Start the streaming session
    await startHeyGenStreamingSession();
    
    return heyGenSessionInfo;
  } catch (error) {
    console.error('Error creating HeyGen session:', error);
    updateStatus('Error: Failed to create HeyGen session');
    throw error;
  }
}

// Get HeyGen session token
async function getHeyGenSessionToken() {
  try {
    const response = await fetch(`${HEYGEN_API_CONFIG.serverUrl}/v1/streaming.create_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': HEYGEN_API_CONFIG.apiKey
      }
    });
    
    const data = await response.json();
    heyGenSessionToken = data.data.token;
    updateStatus('HeyGen session token obtained');
  } catch (error) {
    console.error('Error getting HeyGen session token:', error);
    updateStatus('Error: Failed to get HeyGen session token');
    throw error;
  }
}

// Send text to HeyGen Avatar (with support for talk/repeat modes)
async function sendTextToHeyGen(text, taskType = 'talk') {
  try {
    if (!heyGenSessionInfo || !heyGenSessionToken) {
      console.error('No active HeyGen session');
      updateStatus('Error: No active avatar session');
      return false;
    }
    
    // Validate task type (talk = LLM processing, repeat = exact text)
    const validTaskType = ['talk', 'repeat'].includes(taskType) ? taskType : 'repeat';
    
    updateStatus(`Sending text to avatar (${validTaskType} mode)...`);
    
    // Send the text to the avatar
    const response = await fetch(`${HEYGEN_API_CONFIG.serverUrl}/v1/streaming.task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${heyGenSessionToken}`
      },
      body: JSON.stringify({
        session_id: heyGenSessionInfo.session_id,
        text: text,
        task_type: validTaskType
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to send text to avatar');
    }
    
    updateStatus(`Text sent to avatar (${validTaskType} mode)`);
    
    // Wait for the avatar to finish speaking in all cases
    return waitForAvatarToFinish();
    
  } catch (error) {
    console.error('Error sending text to HeyGen:', error);
    updateStatus('Error: Failed to send text to avatar');
    return false;
  }
}

// Wait for the avatar to finish speaking
function waitForAvatarToFinish() {
  return new Promise((resolve) => {
    if (!heyGenWebSocket || heyGenWebSocket.readyState !== WebSocket.OPEN) {
      // If WebSocket isn't connected, resolve after a default timeout
      setTimeout(() => resolve(true), 5000);
      return;
    }
    
    const handleSpeechEnd = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'speech_end') {
          // Remove this listener once speech ends
          heyGenWebSocket.removeEventListener('message', handleSpeechEnd);
          updateStatus('Avatar finished speaking');
          resolve(true);
        }
      } catch (error) {
        // Ignore JSON parsing errors
      }
    };
    
    // Add event listener to detect when speech ends
    heyGenWebSocket.addEventListener('message', handleSpeechEnd);
    
    // Add a timeout in case the event never arrives
    setTimeout(() => {
      heyGenWebSocket.removeEventListener('message', handleSpeechEnd);
      updateStatus('Avatar speech timeout');
      resolve(true);
    }, 30000); // 30 seconds max wait
  });
}

// Start HeyGen streaming session
async function startHeyGenStreamingSession() {
  try {
    // Start the streaming
    await fetch(`${HEYGEN_API_CONFIG.serverUrl}/v1/streaming.start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${heyGenSessionToken}`
      },
      body: JSON.stringify({
        session_id: heyGenSessionInfo.session_id
      })
    });
    
    // Connect to room
    await heyGenRoom.connect(heyGenSessionInfo.url, heyGenSessionInfo.access_token);
    updateStatus('Connected to room');
    
    updateStatus('Streaming started successfully');
  } catch (error) {
    console.error('Error starting streaming session:', error);
    updateStatus('Error: Failed to start streaming');
    throw error;
  }
}

// Close HeyGen session
async function closeHeyGenSession() {
  try {
    if (!heyGenSessionInfo) {
      updateStatus('No active HeyGen session');
      return;
    }
    
    await fetch(`${HEYGEN_API_CONFIG.serverUrl}/v1/streaming.stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${heyGenSessionToken}`
      },
      body: JSON.stringify({
        session_id: heyGenSessionInfo.session_id
      })
    });
    
    // Close WebSocket
    if (heyGenWebSocket) {
      heyGenWebSocket.close();
      heyGenWebSocket = null;
    }
    
    // Disconnect from room
    if (heyGenRoom) {
      heyGenRoom.disconnect();
      heyGenRoom = null;
    }
    
    // Clear video
    if (remoteVideo.srcObject) {
      remoteVideo.srcObject = null;
    }
    
    // Clear media stream
    if (heyGenMediaStream) {
      heyGenMediaStream.getTracks().forEach(track => track.stop());
      heyGenMediaStream = null;
    }
    
    heyGenSessionInfo = null;
    heyGenSessionToken = null;
    
    updateStatus('HeyGen session closed');
  } catch (error) {
    console.error('Error closing HeyGen session:', error);
    updateStatus('Error: Failed to close HeyGen session');
  }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', init); 