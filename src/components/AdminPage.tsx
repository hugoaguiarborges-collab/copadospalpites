import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { db, auth } from '../firebase';
import AdminParticipants from './AdminParticipants';
import AdminScores from './AdminScores';
import AdminRounds from './AdminRounds';
import AdminResults from './AdminResults';
import { 
  Lock, 
  Unlock, 
  Users, 
  Trophy, 
  Calendar,
  Sparkles, 
  Coins, 
  CheckSquare, 
  LogOut,
  UserCheck2,
  LockIcon,
  CheckCircle2
} from 'lucide-react';
import { UclStarball, UclTrophy, UclBadge, UclLogo } from './UclAssets';

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [googleUser, setGoogleUser] = useState<any>(null);
  
  const [activeTab, setActiveTab] = useState<'participants' | 'results' | 'scores' | 'rounds'>('participants');
  const [errorMsg, setErrorMsg] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Monitor AuthState of Google sign in inside preview
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (user) {
        setGoogleUser(user);
        if (user.email === 'ugosturridge@gmail.com') {
          setIsAuthenticated(true);
        }
      } else {
        setGoogleUser(null);
      }
    });
    return () => unsub();
  }, []);

  // Quick check if custom login cookie/token is in sessionStorage
  useEffect(() => {
    const token = sessionStorage.getItem('as_copa_adm');
    if (token === 'active_session') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleCustomLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const userVal = login.trim();
    const passVal = password.trim();

    if (!userVal || !passVal) {
      setErrorMsg('Preencha os campos de login e senha.');
      return;
    }

    setLoginLoading(true);

    // Bulletproof priority check: instantly allow the requested credentials in-memory
    if (userVal === 'admincopa' && passVal === '1234') {
      sessionStorage.setItem('as_copa_adm', 'active_session');
      setIsAuthenticated(true);
      setLoginLoading(false);
      // Attempt background seeding of the master record, ignoring failure
      try {
        await setDoc(doc(db, 'admins', 'master'), {
          login: 'admincopa',
          senha_hash: '1234'
        });
      } catch (err) {
        console.warn("Seeding master background failure was ignored:", err);
      }
      return;
    }

    try {
      // Fetch master credentials from Firestore
      const snap = await getDoc(doc(db, 'admins', 'master'));
      if (snap.exists()) {
        const data = snap.data();
        if (data.login === userVal && data.senha_hash === passVal) {
          sessionStorage.setItem('as_copa_adm', 'active_session');
          setIsAuthenticated(true);
          return;
        }
      }
      setErrorMsg('Login ou senha incorretos.');
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro de conexão ou privilégios no banco.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg('');
    try {
      const provider = new GoogleAuthProvider();
      const res = await signInWithPopup(auth, provider);
      if (res.user.email === 'ugosturridge@gmail.com') {
        setIsAuthenticated(true);
      } else {
        setErrorMsg('Desculpe, apenas a conta Google do Desenvolvedor (ugosturridge@gmail.com) tem permissão de Administrador.');
        await signOut(auth);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Falha ao autenticar com Google Sign-In.');
    }
  };

  const handleSignOut = async () => {
    sessionStorage.removeItem('as_copa_adm');
    setIsAuthenticated(false);
    await signOut(auth);
  };

  // Login view fallback - UEFA Champions League Portal
  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto py-12 px-4">
        <div className="bg-[#080f33]/95 rounded-2xl border border-cyan-500/35 p-6 md:p-8 shadow-2xl shadow-cyan-950/80 text-center space-y-6 text-white backdrop-blur-xl">
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-gradient-to-b from-[#0a1545] to-[#04081c] border border-cyan-400/50 flex items-center justify-center shadow-lg shadow-cyan-950/80">
                <UclStarball className="w-10 h-10 text-cyan-300" glow />
              </div>
            </div>
          </div>
          
          <div className="space-y-1">
            <div className="flex justify-center">
              <UclBadge text="UEFA ADMIN PORTAL" variant="cyan" />
            </div>
            <h2 className="text-2xl font-black font-display uppercase tracking-tight text-white mt-2">
              Acesso Administrativo
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              Painel restrito de gerenciamento da Copa dos Palpites Champions League.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-950/80 border border-rose-500/40 text-rose-300 text-xs rounded-xl text-left font-mono">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleCustomLogin} className="space-y-4 text-left">
            <div>
              <label htmlFor="adm-login" className="block text-[10px] font-black uppercase tracking-wider text-slate-300 mb-1 font-mono">
                Usuário Administrador
              </label>
              <input
                id="adm-login"
                type="text"
                placeholder="Nome de usuário"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#04081c] border border-cyan-800/60 rounded-xl text-sm text-white focus:outline-hidden focus:ring-1 focus:ring-cyan-400 font-bold placeholder:text-slate-500"
              />
            </div>
            <div>
              <label htmlFor="adm-pass" className="block text-[10px] font-black uppercase tracking-wider text-slate-300 mb-1 font-mono">
                Senha
              </label>
              <input
                id="adm-pass"
                type="password"
                placeholder="Senha de acesso"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#04081c] border border-cyan-800/60 rounded-xl text-sm text-white focus:outline-hidden focus:ring-1 focus:ring-cyan-400 font-bold placeholder:text-slate-500"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-cyan-950/60 font-mono"
            >
              {loginLoading ? 'Conectando ao Painel UEFA...' : 'Entrar com Senha'}
            </button>
          </form>

          {/* Social Google developer options */}
          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-cyan-950"></div>
            <span className="flex-shrink mx-4 text-[9px] font-mono text-slate-500 uppercase tracking-widest font-black">ou</span>
            <div className="flex-grow border-t border-cyan-950"></div>
          </div>

          <button
            onClick={handleGoogleLogin}
            type="button"
            className="w-full py-2.5 bg-[#050b28] border border-cyan-500/30 hover:border-cyan-400 text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-inner"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Entrar com Google do Desenvolvedor
          </button>
          
          <p className="text-[10px] font-mono text-slate-500">
            ★ Credenciais de Teste: <span className="font-semibold text-cyan-300">admincopa / 1234</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Admin header - UEFA Champions League Match Center Grade */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-cyan-500/20 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <UclBadge text="UEFA CONTROL ROOM" variant="cyan" />
            <span className="text-[10px] text-slate-400 font-mono">GERENCIAMENTO GERAL</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase flex items-center gap-2.5 font-display drop-shadow-sm">
            <div className="w-2.5 h-6 bg-gradient-to-b from-cyan-400 to-blue-600 rounded-xs shadow-xs" />
            Supervisão Administrativa da Champions
          </h1>
          <p className="text-xs text-slate-400 mt-1 uppercase font-bold font-mono">
            Logado como: <span className="text-cyan-300 font-bold">{googleUser ? googleUser.email : 'Admin Local'}</span>
          </p>
        </div>

        <button
          onClick={handleSignOut}
          className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 border border-cyan-500/30 bg-[#050b28] text-slate-300 hover:text-white hover:border-cyan-400 rounded-lg text-xs font-bold cursor-pointer transition-all uppercase tracking-wider font-mono shadow-xs"
        >
          <LogOut className="w-3.5 h-3.5 text-cyan-400" /> Sair do Painel
        </button>
      </div>

      {/* Tabs navigation row - UEFA Segmented Controls */}
      <div className="flex overflow-x-auto gap-1 bg-[#050b28] p-1.5 rounded-xl border border-cyan-500/25 shadow-lg shadow-cyan-950/40">
        <button
          onClick={() => setActiveTab('participants')}
          className={`px-4 py-2 text-xs font-bold uppercase transition-all whitespace-nowrap cursor-pointer rounded-lg font-mono flex items-center gap-1.5 ${
            activeTab === 'participants'
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md border border-cyan-300/40'
              : 'text-slate-300 hover:text-white hover:bg-white/5'
          }`}
        >
          <Users className="w-3.5 h-3.5 text-cyan-400" /> Participantes
        </button>
        <button
          onClick={() => setActiveTab('results')}
          className={`px-4 py-2 text-xs font-bold uppercase transition-all whitespace-nowrap cursor-pointer rounded-lg font-mono flex items-center gap-1.5 ${
            activeTab === 'results'
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md border border-cyan-300/40'
              : 'text-slate-300 hover:text-white hover:bg-white/5'
          }`}
        >
          <CheckSquare className="w-3.5 h-3.5 text-cyan-400" /> Avaliar Palpites
        </button>
        <button
          onClick={() => setActiveTab('scores')}
          className={`px-4 py-2 text-xs font-bold uppercase transition-all whitespace-nowrap cursor-pointer rounded-lg font-mono flex items-center gap-1.5 ${
            activeTab === 'scores'
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md border border-cyan-300/40'
              : 'text-slate-300 hover:text-white hover:bg-white/5'
          }`}
        >
          <Coins className="w-3.5 h-3.5 text-cyan-400" /> Ajustar Pontuações
        </button>
        <button
          onClick={() => setActiveTab('rounds')}
          className={`px-4 py-2 text-xs font-bold uppercase transition-all whitespace-nowrap cursor-pointer rounded-lg font-mono flex items-center gap-1.5 ${
            activeTab === 'rounds'
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md border border-cyan-300/40'
              : 'text-slate-300 hover:text-white hover:bg-white/5'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 text-cyan-400" /> Rodadas
        </button>
      </div>

      {/* Grid content panels */}
      <div className="bg-[#080f33]/90 rounded-2xl border border-cyan-500/25 p-6 md:p-8 shadow-2xl backdrop-blur-md text-white">
        {activeTab === 'participants' && <AdminParticipants />}
        {activeTab === 'results' && <AdminResults />}
        {activeTab === 'scores' && <AdminScores />}
        {activeTab === 'rounds' && <AdminRounds />}
      </div>
    </div>
  );
}
