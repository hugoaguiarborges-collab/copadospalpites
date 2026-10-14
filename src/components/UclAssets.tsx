import React from 'react';

/**
 * Ícone oficial da bola de estrelas da UEFA Champions League (Starball)
 * Desenvolvido com geometria vetorial precisa das 8 estrelas conectadas
 */
export function UclStarball({ className = "w-8 h-8", glow = false }: { className?: string; glow?: boolean }) {
  return (
    <svg 
      viewBox="0 0 100 100" 
      fill="currentColor" 
      className={`${className} ${glow ? 'drop-shadow-[0_0_12px_rgba(0,240,255,0.7)]' : ''}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="UEFA Champions League Starball"
    >
      <circle cx="50" cy="50" r="48" fill="#040922" stroke="#00f0ff" strokeWidth="1.5" opacity="0.4" />
      {/* 8 Stars in Champions League configuration with connecting negative space */}
      {/* Central star */}
      <polygon points="50,22 53.5,33 65,33 55.5,40 59,51 50,44 41,51 44.5,40 35,33 46.5,33" fill="currentColor" />
      {/* Top right star */}
      <polygon points="76,28 77,36 85,38 78,43 79,51 73,46 66,50 69,42 63,37 71,36" fill="currentColor" />
      {/* Right star */}
      <polygon points="80,56 79,64 87,69 77,71 75,79 71,72 63,73 68,66 64,59 73,61" fill="currentColor" />
      {/* Bottom right star */}
      <polygon points="58,78 54,85 58,93 51,89 44,94 46,86 41,80 49,82 54,76 56,83" fill="currentColor" />
      {/* Bottom left star */}
      <polygon points="28,74 23,80 25,89 19,84 12,88 15,81 10,75 18,77 23,71 25,78" fill="currentColor" />
      {/* Left star */}
      <polygon points="20,46 19,54 27,59 17,61 15,69 11,62 3,63 8,56 4,49 13,51" fill="currentColor" />
      {/* Top left star */}
      <polygon points="26,22 28,30 36,33 29,38 31,46 24,42 17,46 20,38 14,33 22,32" fill="currentColor" />
      {/* Top center star */}
      <polygon points="50,4 52.5,12 61,12 54,17 56.5,25 50,20 43.5,25 46,17 39,12 47.5,12" fill="currentColor" />
      {/* Starball central ring connection nodes */}
      <circle cx="50" cy="50" r="1.5" fill="#00f0ff" />
      <circle cx="34" cy="46" r="1.2" fill="#00f0ff" />
      <circle cx="66" cy="46" r="1.2" fill="#00f0ff" />
      <circle cx="42" cy="68" r="1.2" fill="#00f0ff" />
      <circle cx="58" cy="68" r="1.2" fill="#00f0ff" />
    </svg>
  );
}

/**
 * O Troféu Oficial da UEFA Champions League (A "Orelhuda" / Coupe des Clubs Champions Européens)
 */
export function UclTrophy({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 100 120" 
      fill="none" 
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Troféu da UEFA Champions League"
    >
      <defs>
        <linearGradient id="silverGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor="#d1d5db" />
          <stop offset="65%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
        <linearGradient id="goldGlow" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#0284c7" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      {/* Base do pedestal */}
      <rect x="35" y="106" width="30" height="6" rx="2" fill="url(#silverGrad)" />
      <rect x="40" y="100" width="20" height="7" rx="1.5" fill="#64748b" />
      {/* Haste do troféu */}
      <path d="M46 92 L46 100 L54 100 L54 92 Z" fill="url(#silverGrad)" />
      <ellipse cx="50" cy="92" rx="8" ry="3" fill="#cbd5e1" />
      {/* Corpo principal do cálice */}
      <path 
        d="M26 24 C26 58 35 88 50 88 C65 88 74 58 74 24 Z" 
        fill="url(#silverGrad)" 
        stroke="#e2e8f0" 
        strokeWidth="1.5"
      />
      {/* Brilho interno vertical do cálice */}
      <path d="M44 26 C44 54 48 82 50 84 C52 82 56 54 56 26 Z" fill="#ffffff" opacity="0.6" />
      {/* Borda superior do cálice */}
      <ellipse cx="50" cy="24" rx="24" ry="5" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1" />
      <ellipse cx="50" cy="24" rx="20" ry="3.5" fill="#1e293b" />
      {/* As Grandes Asas / Alças do Troféu ("A Orelhuda") */}
      {/* Alça Esquerda */}
      <path 
        d="M26 30 C12 28 6 44 8 58 C10 70 20 76 34 76 C32 72 26 70 20 66 C14 62 14 50 16 42 C18 36 22 34 26 33 Z" 
        fill="url(#silverGrad)" 
        stroke="#94a3b8" 
        strokeWidth="1.2"
      />
      {/* Alça Direita */}
      <path 
        d="M74 30 C88 28 94 44 92 58 C90 70 80 76 66 76 C68 72 74 70 80 66 C86 62 86 50 84 42 C82 36 78 34 74 33 Z" 
        fill="url(#silverGrad)" 
        stroke="#94a3b8" 
        strokeWidth="1.2"
      />
      {/* Estrela no centro do troféu */}
      <polygon points="50,44 52,50 58,50 53,54 55,60 50,56 45,60 47,54 42,50 48,50" fill="#0284c7" />
    </svg>
  );
}

/**
 * Logomarca oficial completa com Starball e tipografia oficial da UEFA
 */
export function UclLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const iconSize = size === "sm" ? "w-6 h-6" : size === "lg" ? "w-12 h-12" : "w-7 h-7 sm:w-9 sm:h-9";
  const titleSize = size === "sm" ? "text-xs" : size === "lg" ? "text-xl" : "text-sm sm:text-base md:text-lg";
  const subSize = size === "sm" ? "text-[7px]" : "text-[8px] sm:text-[10px]";

  return (
    <div className="flex items-center gap-2 sm:gap-3 max-w-full min-w-0">
      <div className="relative shrink-0 flex items-center justify-center">
        {/* Glow de fundo */}
        <div className="absolute inset-0 rounded-full bg-cyan-400/20 blur-md scale-125" />
        <div className="relative w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-gradient-to-b from-[#0a1445] via-[#050b28] to-[#020516] border border-cyan-400/50 flex items-center justify-center text-white p-1 shadow-lg shadow-cyan-950/50">
          <UclStarball className={`${iconSize} text-white`} glow />
        </div>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] sm:text-[10px] tracking-[0.2em] font-black text-cyan-400 uppercase font-mono block">
            UEFA
          </span>
          <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-white bg-clip-text text-transparent font-black tracking-wider uppercase font-display block text-[10px] sm:text-[11px] truncate">
            CHAMPIONS LEAGUE
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <h1 className={`${titleSize} font-black tracking-tight text-white uppercase font-display leading-tight drop-shadow-sm truncate`}>
            Copa dos Palpites
          </h1>
          <span className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-[7px] sm:text-[8px] font-black px-1 sm:px-1.5 py-0.5 rounded-sm uppercase tracking-widest shadow-2xs">
            OFICIAL
          </span>
        </div>
        <span className={`${subSize} font-mono text-slate-400 tracking-wider block font-semibold truncate`}>
          Edição Europeia • 36 Clubes • 50 Rodadas
        </span>
      </div>
    </div>
  );
}

/**
 * Malha estrelada e feixes de luz para fundo com a atmosfera da Champions
 */
export function UclAtmosphereBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Gradiente principal noite de Champions */}
      <div className="absolute inset-0 bg-[#030719]" />
      
      {/* Luz central dos refletores de estádio */}
      <div 
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[550px] opacity-40 blur-3xl pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at top, rgba(0, 162, 255, 0.45) 0%, rgba(13, 27, 84, 0.3) 45%, transparent 75%)'
        }}
      />

      {/* Luz ciano elétrica na lateral */}
      <div 
        className="absolute -top-32 right-0 w-[500px] h-[500px] opacity-25 blur-3xl pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(0, 240, 255, 0.35) 0%, rgba(2, 6, 23, 0) 70%)'
        }}
      />

      {/* Estrelas sutis no céu noturno */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `
            radial-gradient(1px 1px at 20px 30px, #ffffff, rgba(0,0,0,0)),
            radial-gradient(1.5px 1.5px at 120px 80px, #38bdf8, rgba(0,0,0,0)),
            radial-gradient(1px 1px at 240px 150px, #ffffff, rgba(0,0,0,0)),
            radial-gradient(2px 2px at 380px 60px, #00f0ff, rgba(0,0,0,0)),
            radial-gradient(1px 1px at 520px 220px, #ffffff, rgba(0,0,0,0)),
            radial-gradient(1.5px 1.5px at 680px 110px, #38bdf8, rgba(0,0,0,0)),
            radial-gradient(1px 1px at 840px 190px, #ffffff, rgba(0,0,0,0)),
            radial-gradient(2px 2px at 980px 75px, #00f0ff, rgba(0,0,0,0)),
            radial-gradient(1px 1px at 1120px 260px, #ffffff, rgba(0,0,0,0))
          `,
          backgroundSize: '1200px 350px'
        }}
      />

      {/* Marca d'água discreta do Starball gigante no fundo */}
      <div className="absolute right-[-120px] top-[10%] w-[550px] h-[550px] opacity-[0.035] text-cyan-200">
        <UclStarball className="w-full h-full" />
      </div>
      <div className="absolute left-[-160px] bottom-[10%] w-[600px] h-[600px] opacity-[0.025] text-cyan-200">
        <UclStarball className="w-full h-full" />
      </div>
    </div>
  );
}

/**
 * Badge oficial com estética dos gráficos de transmissão da UEFA
 */
export function UclBadge({ text, variant = "cyan" }: { text: string; variant?: "cyan" | "gold" | "silver" | "navy" }) {
  const styles = {
    cyan: "bg-cyan-950/80 text-cyan-300 border-cyan-500/40",
    gold: "bg-amber-950/80 text-amber-300 border-amber-500/40",
    silver: "bg-slate-900/80 text-slate-200 border-slate-600/40",
    navy: "bg-[#091136] text-sky-300 border-blue-500/30"
  };

  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase font-mono tracking-widest px-2 py-0.5 rounded border ${styles[variant]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
      {text}
    </span>
  );
}
