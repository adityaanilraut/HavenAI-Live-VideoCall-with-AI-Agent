/**
 * VideoStream component - Handles WebRTC video streaming
 */
export default class VideoStream {
  /**
   * Create a new VideoStream instance
   * @param {HTMLVideoElement} localVideo - Local video element
   * @param {HTMLVideoElement} remoteVideo - Remote video element
   * @param {object} socketConnection - Socket.io connection
   * @param {string} roomId - Room ID for signaling
   */
  constructor(localVideo, remoteVideo, socketConnection, roomId) {
    this.localVideo = localVideo;
    this.remoteVideo = remoteVideo;
    this.socket = socketConnection;
    this.roomId = roomId;
    this.peerConnection = null;
    this.localStream = null;
    this.configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
    
    this.setupSocketListeners();
  }
  
  /**
   * Set up socket listeners for WebRTC signaling
   */
  setupSocketListeners() {
    this.socket.on('offer', async (offer) => {
      console.log('Received offer');
      try {
        if (!this.peerConnection) {
          await this.createPeerConnection();
        }
        
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        
        this.socket.emit('answer', answer, this.roomId);
      } catch (error) {
        console.error('Error handling offer:', error);
      }
    });
    
    this.socket.on('answer', async (answer) => {
      console.log('Received answer');
      try {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (error) {
        console.error('Error handling answer:', error);
      }
    });
    
    this.socket.on('ice-candidate', async (candidate) => {
      console.log('Received ICE candidate');
      try {
        if (candidate && this.peerConnection) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (error) {
        console.error('Error handling ICE candidate:', error);
      }
    });
  }
  
  /**
   * Create a peer connection
   */
  async createPeerConnection() {
    try {
      this.peerConnection = new RTCPeerConnection(this.configuration);
      
      // Add local stream tracks to peer connection
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection.addTrack(track, this.localStream);
        });
      }
      
      // Set up ICE candidate handling
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.emit('ice-candidate', event.candidate, this.roomId);
        }
      };
      
      // Set up remote stream handling
      this.peerConnection.ontrack = (event) => {
        this.remoteVideo.srcObject = event.streams[0];
      };
      
      console.log('Peer connection created');
    } catch (error) {
      console.error('Error creating peer connection:', error);
      throw error;
    }
  }
  
  /**
   * Start the video call
   */
  async startCall() {
    try {
      // Get user media (camera and microphone)
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });
      
      // Display local video
      this.localVideo.srcObject = this.localStream;
      
      // Create peer connection
      await this.createPeerConnection();
      
      // Join room
      this.socket.emit('join-room', this.roomId);
      
      // Create and send offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      this.socket.emit('offer', offer, this.roomId);
      
      console.log('Call started');
      return true;
    } catch (error) {
      console.error('Error starting call:', error);
      throw error;
    }
  }
  
  /**
   * End the video call
   */
  endCall() {
    try {
      // Stop local stream tracks
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
      }
      
      // Close peer connection
      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }
      
      // Clear video elements
      this.localVideo.srcObject = null;
      this.remoteVideo.srcObject = null;
      
      console.log('Call ended');
      return true;
    } catch (error) {
      console.error('Error ending call:', error);
      throw error;
    }
  }
  
  /**
   * Toggle microphone
   */
  toggleMic() {
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        const enabled = !audioTracks[0].enabled;
        audioTracks[0].enabled = enabled;
        return enabled;
      }
    }
    return false;
  }
  
  /**
   * Toggle video
   */
  toggleVideo() {
    if (this.localStream) {
      const videoTracks = this.localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        const enabled = !videoTracks[0].enabled;
        videoTracks[0].enabled = enabled;
        return enabled;
      }
    }
    return false;
  }
  
  /**
   * Play a video URL in the remote video element
   * @param {string} videoUrl - URL of the video to play
   */
  playVideoInRemote(videoUrl) {
    // Create a source element
    const source = document.createElement('source');
    source.src = videoUrl;
    source.type = 'video/mp4';
    
    // Clear existing sources and tracks
    this.remoteVideo.innerHTML = '';
    
    // Add new source
    this.remoteVideo.appendChild(source);
    
    // Load and play the video
    this.remoteVideo.load();
    return this.remoteVideo.play()
      .catch(error => {
        console.error('Error playing video:', error);
        throw error;
      });
  }
} 