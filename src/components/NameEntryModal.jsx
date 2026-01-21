import { useState } from "react";
import { User, Video, X } from "lucide-react";

const NameEntryModal = ({ roomId, isOpen, onSubmit, onClose }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit({ name: name.trim(), email: email.trim() || `user_${Date.now()}@meeting.com` });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-2xl p-8 max-w-md w-full mx-4 border border-purple-600">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600 rounded-full">
              <Video className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Join Meeting</h2>
              <p className="text-sm text-gray-400">Room: {roomId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Your Name (Required)
              </div>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Email Address (Optional)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed py-4 rounded-lg font-bold text-lg transition-all"
          >
            Join Meeting
          </button>
        </form>
      </div>
    </div>
  );
};

export default NameEntryModal;
