import React from 'react';
import '../global.css'; 

const ErrorMessage = ({ message }) => {
  if (!message) return null;

  return (
    <div className="error-message">
      {message}
    </div>
  );
};

export default ErrorMessage;