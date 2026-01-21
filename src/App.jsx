// Import routes
import { Routes, Route } from "react-router-dom";

// Import UseReducer
import SocketProvider from "./providers/Socket";
import PeerProvider from "./providers/Peer";

// Import Pages
import HomePage from "./pages/HomePage";
import RoomPage from "./pages/RoomPage";

// App Componenet
function App() {
  // UI/UX Design
  return (
    <SocketProvider>
      <PeerProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/room/:roomId" element={<RoomPage />} />
        </Routes>
      </PeerProvider>
    </SocketProvider>
  );
}

export default App;
