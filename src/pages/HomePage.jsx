/* eslint-disable react-hooks/exhaustive-deps */

// Import motion & fadeIn
import { motion } from "framer-motion";
import { fadeIn } from "../components/Animation/Variants";

// Import hooks
import { useEffect, useState } from "react";

// Import Navigation
import { useNavigate } from "react-router-dom";

// Import Icons
import { Mail, User, Hash, Video, Zap, Shield, Users } from "lucide-react";
import { toast } from "react-hot-toast";

// Import useSocket
import { useSocket } from "../providers/Socket";

// HomePage Component
const HomePage = () => {
  const { socket } = useSocket();
  const [email, setEmail] = useState("");
  const [roomId, setRoomId] = useState("");
  const [name, setName] = useState("");
  const navigate = useNavigate();

  // -----------  handleRoomJoined -------------------
  const handleRoomJoined = ({ roomId, emailId, name: userName }) => {
    // Store user data in localStorage for reconnection
    localStorage.setItem(
      "userData",
      JSON.stringify({
        email: emailId,
        name: userName,
      }),
    );

    navigate(`/room/${roomId}`);
    toast.success(`Welcome to room ${roomId}!`);
  };

  // ----------- UseEffect ------------------
  useEffect(() => {
    if (!socket) return;
    socket.on("joined-room", handleRoomJoined);

    return () => {
      socket.off("joined-room", handleRoomJoined);
    };
  }, [socket]);

  // -------------- handleJoinRoom ------------------------
  const handleJoinRoom = () => {
    if (!email || !roomId || !name) {
      toast.error("Please fill all fields");
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      toast.error("Please enter a valid email");
      return;
    }

    // Store user data immediately
    localStorage.setItem("userData", JSON.stringify({ email, name }));

    socket.emit("join-room", { roomId, emailId: email, name });
  };

  // ------------------- generateRoomId-----------------------
  const generateRoomId = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setRoomId(result);
  };

  // Auto-fill if returning user
  useEffect(() => {
    const savedData = localStorage.getItem("userData");
    if (savedData) {
      const { email: savedEmail, name: savedName } = JSON.parse(savedData);
      setEmail(savedEmail || "");
      setName(savedName || "");
    }
  }, []);

  // UI/UX Design
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-black to-blue-900 p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            variants={fadeIn("down", 0.2)}
            initial="hidden"
            whileInView={"show"}
            viewport={{ once: true, amount: 0.3 }}
            className="flex items-center justify-center mb-4"
          >
            <Video className="text-blue-500 mr-3" size={40} />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
              VideoConnect
            </h1>
          </motion.div>
          <p className="text-gray-400 text-sm animate-pulse " style={{ animationDuration: "3s" }}>
            Secure, high-quality video meetings
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-800/50 backdrop-blur-sm p-3 rounded-xl text-center hover:scale-105 duration-500 transition-all font-sans">
            <Shield className="w-6 h-6 text-green-500 mx-auto mb-2" />
            <p className="text-xs text-gray-300">Secure</p>
          </div>
          <div className="bg-gray-800/50 backdrop-blur-sm p-3 rounded-xl text-center hover:scale-105 duration-500 transition-all font-sans">
            <Zap className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
            <p className="text-xs text-gray-300">Fast</p>
          </div>
          <div className="bg-gray-800/50 backdrop-blur-sm p-3 rounded-xl text-center hover:scale-105 duration-500 transition-all font-sans">
            <Users className="w-6 h-6 text-purple-500 mx-auto mb-2" />
            <p className="text-xs text-gray-300">Group</p>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-2xl font-bold text-center text-white mb-2 font-sans">Join Meeting</h2>
          <p className="text-center text-gray-300 mb-8 text-sm font-sans">
            Enter your details to join or create a meeting
          </p>

          {/* Name */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <User className="inline w-4 h-4 mr-2" />
              Your Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 rounded-xl bg-white/20 text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              autoFocus
            />
          </div>

          {/* Email */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <Mail className="inline w-4 h-4 mr-2" />
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 rounded-xl bg-white/20 text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>

          {/* Room ID */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-300">
                <Hash className="inline w-4 h-4 mr-2" />
                Room Code
              </label>
              <button
                onClick={generateRoomId}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Generate Random
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                placeholder="Enter room code"
                className="flex-1 px-4 py-3 rounded-xl bg-white/20 text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 transition-all uppercase"
              />
              <button
                onClick={generateRoomId}
                className="px-4 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors"
                title="Generate random code"
              >
                <Hash size={20} />
              </button>
            </div>
          </div>

          {/* Button */}
          <button
            onClick={handleJoinRoom}
            className="w-full py-4 rounded-xl cursor-pointer bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold hover:from-blue-700 hover:to-purple-700 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 shadow-lg"
          >
            Join Meeting
          </button>

          {/* Quick Join Note */}
          <p className="text-center text-gray-400 text-sm mt-6 font-sans">
            Don't have a code? Generate one and share with others!
          </p>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-gray-500 text-sm font-sans">
            By joining, you agree to our{" "}
            <a href="#" className="text-blue-400 hover:underline">
              Terms
            </a>{" "}
            and{" "}
            <a href="#" className="text-blue-400 hover:underline">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
