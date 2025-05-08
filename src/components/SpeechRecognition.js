/**
 * SpeechRecognition component - Handles speech-to-text conversion
 */
export default class SpeechRecognizer {
  /**
   * Create a new SpeechRecognizer instance
   * @param {function} onResultCallback - Callback function to handle recognition results
   * @param {function} onErrorCallback - Callback function to handle recognition errors
   * @param {function} onEndCallback - Callback function to handle recognition end
   */
  constructor(onResultCallback, onErrorCallback, onEndCallback) {
    this.recognition = null;
    this.isListening = false;
    this.onResultCallback = onResultCallback;
    this.onErrorCallback = onErrorCallback;
    this.onEndCallback = onEndCallback;
    
    this.init();
  }
  
  /**
   * Initialize speech recognition
   */
  init() {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      this.recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';
      
      this.recognition.onresult = this.handleResult.bind(this);
      this.recognition.onerror = this.handleError.bind(this);
      this.recognition.onend = this.handleEnd.bind(this);
      
      return true;
    } else {
      console.error('Speech recognition not supported in this browser');
      if (this.onErrorCallback) {
        this.onErrorCallback('Speech recognition not supported in this browser');
      }
      return false;
    }
  }
  
  /**
   * Handle recognition results
   * @param {SpeechRecognitionEvent} event - The recognition event
   */
  handleResult(event) {
    if (event.results && event.results.length > 0) {
      const transcript = event.results[0][0].transcript;
      const confidence = event.results[0][0].confidence;
      
      console.log(`Recognized: "${transcript}" (Confidence: ${confidence})`);
      
      if (this.onResultCallback) {
        this.onResultCallback(transcript, confidence);
      }
    }
  }
  
  /**
   * Handle recognition errors
   * @param {SpeechRecognitionError} event - The error event
   */
  handleError(event) {
    console.error('Speech recognition error:', event.error);
    this.isListening = false;
    
    if (this.onErrorCallback) {
      this.onErrorCallback(event.error);
    }
  }
  
  /**
   * Handle recognition end
   */
  handleEnd() {
    this.isListening = false;
    
    if (this.onEndCallback) {
      this.onEndCallback();
    }
  }
  
  /**
   * Start listening for speech
   */
  start() {
    if (this.recognition) {
      try {
        this.recognition.start();
        this.isListening = true;
        console.log('Speech recognition started');
        return true;
      } catch (error) {
        console.error('Error starting speech recognition:', error);
        this.isListening = false;
        
        if (this.onErrorCallback) {
          this.onErrorCallback(error.message);
        }
        return false;
      }
    }
    return false;
  }
  
  /**
   * Stop listening for speech
   */
  stop() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
        this.isListening = false;
        console.log('Speech recognition stopped');
        return true;
      } catch (error) {
        console.error('Error stopping speech recognition:', error);
        return false;
      }
    }
    return false;
  }
  
  /**
   * Check if speech recognition is supported
   * @returns {boolean} - Whether speech recognition is supported
   */
  static isSupported() {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }
} 