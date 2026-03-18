import React, { useState } from 'react';
import { Socket } from 'socket.io-client';

interface Room {
  id: number;
}

interface Props {
  socket: Socket;
  selectedRoom: Room;
}

export default function MessageInput({ socket, selectedRoom }: Props) {
  const [newMessage, setNewMessage] = useState('');

  const handleSend = () => {
    if (!newMessage.trim()) return;
    socket.emit('sendMessage', {
      roomId: selectedRoom.id,
      content: newMessage,
    });
    setNewMessage('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSend();
  };

  return (
    <div style={{ display: 'flex', padding: '10px', borderTop: '1px solid #ddd', gap: '10px' }}>
      <input
        value={newMessage}
        onChange={e => setNewMessage(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder="Type a message..."
        style={{ flex: 1, padding: '8px', fontSize: '16px' }}
      />
      <button
        onClick={handleSend}
        style={{ padding: '8px 16px', fontSize: '16px', cursor: 'pointer' }}
      >
        Send
      </button>
    </div>
  );
}