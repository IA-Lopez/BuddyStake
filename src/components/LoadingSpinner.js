// components/LoadingSpinner.js
import React, { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';

const LoadingSpinner = () => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => (prev >= 95 ? 0 : prev + 5)); // Reset to 0 if 95% or above, otherwise increment by 5%
    }, 300); // Increase progress every 500ms

    return () => clearInterval(interval); // Clear interval on component unmount
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Fondo translúcido */}
      <div className="absolute inset-0 bg-black bg-opacity-50"></div>
  
      {/* Barra de progreso: z-index 10 */}
      <div className="relative w-full max-w-lg px-4 z-10">
        <Progress value={progress} className="h-2" />
      </div>
  
      {/* Logo: z-index 20 */}
      <div className="absolute inset-0 flex items-center justify-center z-20">
        <img src="/buddyLogo.png" alt="Buddy Logo" className="w-16 h-16" />
      </div>
    </div>
  );  
};

export default LoadingSpinner;
