
import React from 'react';

interface LogoProps {
  className?: string;
  showText?: boolean;
  light?: boolean;
  tenantLogoUrl?: string;
}

export const Logo: React.FC<LogoProps> = ({ 
  className = "h-10", 
  showText = true,
  light = false,
  tenantLogoUrl
}) => {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      {/* Container for branding */}
      <div className="flex items-center gap-3 h-full">
        {/* MIKI Icon Squircle - Constante visuelle */}
        <img src="/logo.png" className="h-[120%] w-auto drop-shadow-sm shrink-0 rounded-[28px] object-contain" alt="MIKI" />

        {tenantLogoUrl && (
          <>
            <div className={`w-px h-2/3 ${light ? 'bg-white/20' : 'bg-border'}`}></div>
            <div className="h-full flex items-center py-0.5">
                <img 
                  src={tenantLogoUrl} 
                  alt="Tenant Logo" 
                  className="h-full w-auto max-w-[160px] object-contain object-left rounded-sm"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
            </div>
          </>
        )}
      </div>
      
      {showText && !tenantLogoUrl && (
        <span className={`text-xl font-black tracking-[0.15em] ${light ? "text-white" : "text-dark"}`}>
          MIKI
        </span>
      )}
    </div>
  );
};
