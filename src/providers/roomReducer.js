// initialState
export const initialState = {
  myStream: null,
  remoteStream: null,
  cameraOn: true,
  remoteCameraOn: true,
  isSwapped: false,
  unreadMessages: 0,
  remoteVideoReady: false,
  micOn: true,
  streamReady: false,
  hasJoinedRoom: false,
  remoteEmail: "",
  remoteName: "",
  myName: "",
  messages: [],
  messageText: "",
  screenSharing: false,
  handfreeDeviceId: null,
  usingHandfree: false,
  chatClose: false,
  callStartTime: null,
  callDuration: { hours: 0, minutes: 0, seconds: 0 },
  isCallActive: false,
 echoCancellationEnabled: true,
  noiseSuppressionEnabled: true,
  audioDevices: [],
  selectedAudioDevice: null,
  speakerMode: false
};

export function roomReducer(state, action) {
  switch (action.type) {
    case "SET_MY_STREAM":
      return { ...state, myStream: action.payload };
    case "SET_REMOTE_STREAM":
      return { ...state, remoteStream: action.payload };
    case "TOGGLE_CAMERA":
      return { ...state, cameraOn: !state.cameraOn };
    case "SET_REMOTE_CAMERA":
      return { ...state, remoteCameraOn: action.payload };
    case "TOGGLE_MIC":
      return { ...state, micOn: !state.micOn };
    case "SET_STREAM_READY":
      return { ...state, streamReady: action.payload };
    case "SET_HAS_JOINED_ROOM":
      return { ...state, hasJoinedRoom: action.payload };
    case "SET_REMOTE_EMAIL":
      return { ...state, remoteEmail: action.payload };
    case "SET_MY_NAME":
      return { ...state, myName: action.payload };
    case "SET_REMOTE_NAME":
      return { ...state, remoteName: action.payload };
    case "SET_MESSAGES":
      return { ...state, messages: action.payload };
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.payload] };
    case "SET_MESSAGE_TEXT":
      return { ...state, messageText: action.payload };
    case "SET_SCREEN_SHARING":
      return { ...state, screenSharing: action.payload };
    case "SET_HANDFREE_DEVICE":
      return { ...state, handfreeDeviceId: action.payload };
    case "TOGGLE_HANDFREE":
      return { ...state, usingHandfree: !state.usingHandfree };
    case "INCREMENT_UNREAD":
      return { ...state, unreadMessages: state.unreadMessages + 1 };
    case "RESET_UNREAD":
      return { ...state, unreadMessages: 0 };
    case "SET_CHATCLOSE":
      return { ...state, chatClose: action.payload };
    case "SET_IsSWAPPED":
      return { ...state, isSwapped: action.payload };
    case "SET_REMOTEVIDEOREADY":
      return { ...state, remoteVideoReady: action.payload };
    case "START_CALL":
      return {
        ...state,
        callStartTime: Date.now(),
        isCallActive: true,
      };
    case "UPDATE_CALL_DURATION":
      return {
        ...state,
        callDuration: action.payload,
      };
    case "END_CALL":
      return {
        ...state,
        callStartTime: null,
        isCallActive: false,
        callDuration: { hours: 0, minutes: 0, seconds: 0 },
      };
  case "TOGGLE_ECHO_CANCELLATION":
  return { ...state, echoCancellationEnabled: !state.echoCancellationEnabled };
case "TOGGLE_NOISE_SUPPRESSION":
  return { ...state, noiseSuppressionEnabled: !state.noiseSuppressionEnabled };
case "SET_AUDIO_DEVICES":
  return { ...state, audioDevices: action.payload };
case "SELECT_AUDIO_DEVICE":
  return { ...state, selectedAudioDevice: action.payload };
case "SET_SPEAKER_MODE":
  return { ...state, speakerMode: action.payload };
    default:
      return state;
  }
}
