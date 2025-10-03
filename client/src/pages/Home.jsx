import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

const pages = [
  { name: 'Manager', path: '/manager' },
  { name: 'Queue', path: '/queue' },
  { name: 'Admin', path: '/admin' },
  { name: 'Dispatcher', path: '/dispatcher' },
  { name: 'ShowQueue ', path: '/show' },
];

const Menu = () => {
  const navigate = useNavigate();

  return (
    <div className="menu-container">
      {pages.map((page, i) => (
        <div key={i} className="menu-block" onClick={() => navigate(page.path)}>
          {page.name}
        </div>
      ))}
    </div>
  );
};

export default Menu;
