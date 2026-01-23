import { createContext, useContext, useMemo } from "react";
import { io } from "socket.io-client";

const SocketContext = createContext();

const SocketProvider = ({ children }) => {
  // Use environment variable for production
  const backendUrl = process.env.NODE_ENV === 'production'
    ? process.env.REACT_APP_BACKEND_URL || "https://realtime-video-app-backend-production.up.railway.app" // REPLACE
    : "http://localhost:5001";

  const socket = useMemo(() => io(backendUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 20000,
  }), [backendUrl]);

  return <SocketContext.Provider value={{ socket }}>{children}</SocketContext.Provider>;
};

export default SocketProvider;

export const useSocket = () => useContext(SocketContext);

