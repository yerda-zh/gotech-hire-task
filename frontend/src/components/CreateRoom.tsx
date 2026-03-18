import React, { useState } from 'react';
import { API_URL } from '../constants';
import { useAuth } from '../context/AuthContext';

interface Props {
  onRoomCreated: () => void;
}

export default function CreateRoom({ onRoomCreated }: Props) {
  const { token } = useAuth();
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [showCreateRoom, setShowCreateRoom] = useState(false);

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return;

    await fetch(`${API_URL}/chat/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: newRoomName, description: newRoomDesc }),
    });

    setNewRoomName('');
    setNewRoomDesc('');
    setShowCreateRoom(false);
    onRoomCreated();
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: 0 }}>Rooms</h3>
        <button
          onClick={() => setShowCreateRoom(!showCreateRoom)}
          style={{ fontSize: '20px', cursor: 'pointer', border: 'none', background: 'none' }}
        >
          +
        </button>
      </div>

      {showCreateRoom && (
        <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <input
            placeholder="Room name"
            value={newRoomName}
            onChange={e => setNewRoomName(e.target.value)}
            style={{ padding: '5px' }}
          />
          <input
            placeholder="Description (optional)"
            value={newRoomDesc}
            onChange={e => setNewRoomDesc(e.target.value)}
            style={{ padding: '5px' }}
          />
          <button onClick={handleCreateRoom} style={{ padding: '5px', cursor: 'pointer' }}>
            Create
          </button>
        </div>
      )}
    </>
  );
}