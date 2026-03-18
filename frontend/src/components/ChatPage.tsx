import React, { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import RoomList from './RoomList';
import MessageItem from './MessageItem';
import MessageInput from './MessageInput';
import CreateRoom from './CreateRoom';
import Header from '../class-components/Header.class';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../constants';

interface Room {
  id: number;
  name: string;
  description?: string;
}

interface Message {
  id: number;
  content: string;
  username: string;
  createdAt: string;
  userId: number;
}

interface Props {
  socket: Socket;
  onLogout: () => void;
}

export default function ChatPage({ socket, onLogout }: Props) {
  const { token, userId } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/chat/rooms`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setRooms(Array.isArray(data) ? data : []);
    } catch {
      setRooms([]);
    }
  }, [token]);

  const fetchMessages = useCallback(async (roomId: number) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`${API_URL}/chat/rooms/${roomId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(Array.isArray(data.data) ? data.data : []);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, [token]);

  useEffect(() => {
    fetchRooms();

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    const onNewMessage = (message: Message) => {
      setMessages(prev => [...prev, message]);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('newMessage', onNewMessage);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('newMessage', onNewMessage);
    };
  }, [socket, fetchRooms]);

  const handleRoomSelect = (room: Room) => {
    if (selectedRoom) socket.emit('leaveRoom', { roomId: selectedRoom.id });
    setSelectedRoom(room);
    socket.emit('joinRoom', { roomId: room.id });
    fetchMessages(room.id);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ width: '250px', borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column', padding: '10px', backgroundColor: '#f5f5f5' }}>
        <Header isConnected={isConnected} onLogout={onLogout} />
        <CreateRoom onRoomCreated={fetchRooms} />
        <RoomList rooms={rooms} selectedRoom={selectedRoom} onSelectRoom={handleRoomSelect} />
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {selectedRoom ? (
          <>
            <div style={{ padding: '10px', borderBottom: '1px solid #ddd', backgroundColor: '#f9f9f9' }}>
              <h3 style={{ margin: 0 }}>#{selectedRoom.name}</h3>
              {selectedRoom.description && (
                <p style={{ margin: '5px 0 0', color: '#666', fontSize: '14px' }}>{selectedRoom.description}</p>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
              {loadingMessages ? (
                <p>Loading messages...</p>
              ) : (
                messages.map(msg => (
                  <MessageItem
                    key={msg.id}
                    message={msg}
                    isOwn={msg.userId === userId}
                  />
                ))
              )}
            </div>

            <MessageInput socket={socket} selectedRoom={selectedRoom} />
          </>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <p style={{ color: '#666' }}>Select a room to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}