import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

const pages = [
  { name: 'Менеджер', path: '/manager' },
  { name: 'Черга', path: '/queue' },
  { name: 'Адмін', path: '/admin' },
  { name: 'Диспетчер', path: '/dispatcher' },
  { name: 'Показ черги', path: '/show' },
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
