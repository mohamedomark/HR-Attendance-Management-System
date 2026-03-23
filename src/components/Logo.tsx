import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = "h-12" }) => {
  return (
    <svg viewBox="0 0 300 120" className={className} xmlns="http://www.w3.org/2000/svg">
      {/* Origami Bird */}
      <g transform="translate(10, 30)">
        {/* Black Top Wing */}
        <polygon points="30,10 80,10 40,25" fill="#000000" />
        {/* Red Head/Beak */}
        <polygon points="10,20 30,10 40,25 10,40" fill="#E4312b" />
        {/* White Body */}
        <polygon points="40,25 80,10 80,40 10,40" fill="#F0F0F0" />
        {/* Green Bottom Wing */}
        <polygon points="10,40 80,40 50,70 30,50" fill="#149954" />
      </g>

      {/* "abg" Text */}
      <text x="100" y="80" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontSize="64" fill="#1e2b58" letterSpacing="-2">abg</text>
      
      {/* Colored Dots */}
      <circle cx="120" cy="62" r="7" fill="#2596be" />
      <circle cx="166" cy="62" r="7" fill="#8dc63f" />
      <circle cx="210" cy="62" r="7" fill="#fbd00f" />

      {/* Subtitle */}
      <text x="105" y="100" fontFamily="Arial, Helvetica, sans-serif" fontWeight="600" fontSize="9" fill="#1e2b58" letterSpacing="2">ARTIFICIAL</text>
      <text x="105" y="112" fontFamily="Arial, Helvetica, sans-serif" fontWeight="600" fontSize="9" fill="#1e2b58" letterSpacing="2">BUSINESS GATE</text>
    </svg>
  );
};
