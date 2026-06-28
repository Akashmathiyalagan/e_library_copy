import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './ModeratorAuth.css';

const ModeratorAuth = () => {
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (isRegister) {
        await axios.post('http://localhost:5000/api/moderator/register', {
          email,
          username,
          password,
        });
        setMessage('Moderator account registered successfully! You can now log in.');
        setIsRegister(false);
        setPassword('');
      } else {
        const res = await axios.post('http://localhost:5000/api/moderator/login', {
          email,
          password,
        });
        localStorage.setItem('moderatorToken', res.data.token);
        localStorage.setItem('moderatorName', res.data.username);
        navigate('/moderator-dashboard');
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='mod-auth-container'>
      <div className='mod-auth-card'>
        <div className='mod-auth-logo'>✦</div>
        <h2 className='mod-auth-title'>
          {isRegister ? 'Register Moderator Account' : 'Moderator Security Gate'}
        </h2>
        <p className='mod-auth-subtitle'>
          {isRegister
            ? 'Configure scholarly audit profiles for autonomous plagiarism checks'
            : 'Authorized audit personnel only. Direct URL access gateway.'}
        </p>

        {error && <div className='mod-auth-error'>⚠ {error}</div>}
        {message && <div className='mod-auth-success'>✓ {message}</div>}

        <form onSubmit={handleSubmit} className='mod-auth-form'>
          {isRegister && (
            <div className='mod-auth-group'>
              <label>Username / ID</label>
              <input
                type='text'
                placeholder='e.g. auditor_alpha'
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          )}
          <div className='mod-auth-group'>
            <label>Security Email</label>
            <input
              type='email'
              placeholder='e.g. moderator@elibrary.com'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className='mod-auth-group'>
            <label>Access Key / Password</label>
            <input
              type='password'
              placeholder='••••••••'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type='submit' className='mod-auth-btn' disabled={loading}>
            {loading ? 'Verifying...' : isRegister ? 'Register Moderator' : 'Authenticate & Open Gate'}
          </button>
        </form>

        <div className='mod-auth-toggle'>
          {isRegister ? (
            <p>
              Already registered?{' '}
              <span onClick={() => { setIsRegister(false); setError(''); }}>
                Authenticate Here
              </span>
            </p>
          ) : (
            <p>
              New Moderator?{' '}
              <span onClick={() => { setIsRegister(true); setError(''); }}>
                Create Admin Auditor Profile
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModeratorAuth;