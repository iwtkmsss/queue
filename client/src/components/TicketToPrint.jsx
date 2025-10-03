import React, { useEffect } from 'react';
import './TicketToPrint.css';

export default function TicketToPrint({ number, isPrivileged, clientName, onPrinted }) {
  useEffect(() => {
    // Запускаємо друк і закриваємо компонент після друку
    window.print();
    const timer = setTimeout(() => {
      if (onPrinted) onPrinted();
    }, 300); // Трохи затримки, щоб print() спрацював

    return () => clearTimeout(timer);
  }, [onPrinted]);

  const now = new Date();
  const date = now.toLocaleDateString('uk-UA');
  const time = now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="ticket-print-wrapper">
      <div className="ticket">
        <h2>Ваш номер у черзі</h2>
        <div className="ticket-number">{number}</div>
        <div className="ticket-details">
          <div>Дата: {date}</div>
          <div>Час: {time}</div>
          {isPrivileged && <div className="privilege">Пільга</div>}
          {clientName && <div className="client-name">{clientName}</div>}
        </div>
      </div>
    </div>
  );
}
