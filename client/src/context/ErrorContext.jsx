import React, { createContext, useContext, useState } from 'react';

const ErrorContext = createContext();

export const useError = () => useContext(ErrorContext);

export const ErrorProvider = ({ children }) => {
  const [message, setMessage] = useState('');

  const showError = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 4000);
  };

  return (
    <ErrorContext.Provider value={{ showError }}>
      {children}
      {message && <div className="error-message">{message}</div>}
    </ErrorContext.Provider>
  );
};
