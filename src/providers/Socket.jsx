/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo } from "react";
import { io } from "socket.io-client";

const SocketContext = createContext();

// SocketProvider Component
const SocketProvider = ({ children }) => {
  const socket = useMemo(() => io(`https://realtime-video-app-backend-production.up.railway.app`), []);
  return <SocketContext.Provider value={{ socket }}>{children}</SocketContext.Provider>;
};

export default SocketProvider;

// useSocket Component
export const useSocket = () => useContext(SocketContext);
