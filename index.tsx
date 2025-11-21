import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

// --- Constants & Types ---

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

const DIFFICULTIES: Record<Difficulty, { speed: number; gap: number; gravity: number; jump: number; pipeInterval: number }> = {
  EASY: { speed: 2, gap: 240, gravity: 0.25, jump: -5.5, pipeInterval: 2200 },
  MEDIUM: { speed: 3, gap: 190, gravity: 0.5, jump: -7.5, pipeInterval: 1800 },
  HARD: { speed: 5, gap: 150, gravity: 0.7, jump: -9, pipeInterval: 1400 },
};

const FUNNY_TEXTS = [
  "Marcus hepper!",
  "Marcus: Du har en fed bil!",
  "Marcus: Jeg hepper på dig!",
  "Marcus: Du er min største fan!",
  "Marcus: Skal jeg vise mine overarme?",
  "Marcus: Se mine overarme er vokset!",
  "Marcus går helt amok!",
  "Marcus: Kom så Nichlas!",
  "Marcus tabte kæben!",
  "Marcus er kæmpe fan!",
  "Marcus: Det er snyd?!",
  "Marcus skylder kage!",
  "Marcus: Respekt!",
  "Marcus: Du er for vild!",
  "Marcus giver is!",
  "Marcus ser op til dig!",
  "Marcus klapper!",
  "Marcus: Wow!",
  "Marcus: Den er god nok!",
  "Du er steget en level i år!",
  "Mere kage til dig!",
  "Fødselsdagskongen!",
  "Kæmpe chef!",
  "Flyvende Nichlas!",
  "Turbo på!",
  "Du vinder et stykke kage mere!",
  "Mesterflyver!",
  "Sådan skal det gøres!",
  "Marcus: Du styrer!",
  "Marcus: Kæmpe highfive!",
  "Marcus tror på dig!",
  "Marcus: Det er magi!",
  "Marcus jubler!",
  "Marcus: En gang til!"
];

type GameState = 'START' | 'PLAYING' | 'GAME_OVER';

interface Player {
  x: number;
  y: number;
  w: number;
  h: number;
  dy: number;
  angle: number;
}

interface Pipe {
  x: number;
  y: number; // Top pipe height
  w: number;
  passed: boolean;
  passedBackward: boolean; // Track if passed backwards
  id: number;
}

interface Cloud {
  x: number;
  y: number;
  scale: number;
  speed: number;
  type: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface Toast {
  text: string;
  x: number;
  y: number;
  life: number;
  opacity: number;
  color?: string;
}

// --- Audio System ---

class SoundManager {
  ctx: AudioContext | null = null;
  bgmOscillators: OscillatorNode[] = [];
  bgmGain: GainNode | null = null;
  isPlayingBgm = false;
  noteTimer: number | null = null;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
    }
  }

  playJump() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playScore() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    
    // Coin sound - two tones
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    osc1.frequency.setValueAtTime(1200, t);
    osc1.frequency.setValueAtTime(1600, t + 0.05);
    gain1.gain.setValueAtTime(0.1, t);
    gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    osc1.start(t);
    osc1.stop(t + 0.2);
  }

  playReverse() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // "Rewind" sound - sliding pitch up fast
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.3);
    
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.3);
    
    osc.start(t);
    osc.stop(t + 0.3);
  }

  playCrash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    
    // White noise burst
    const bufferSize = this.ctx.sampleRate * 0.3; 
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = this.ctx.createGain();
    noise.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    
    noiseGain.gain.setValueAtTime(0.4, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    noise.start(t);

    // Low thud
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  playParty() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    // Party horn slide
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.linearRampToValueAtTime(500, t + 0.2);
    osc.frequency.linearRampToValueAtTime(250, t + 0.5);
    
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.5);
    
    osc.start(t);
    osc.stop(t + 0.5);
  }

  startMusic() {
    if (!this.ctx || this.isPlayingBgm) return;
    this.isPlayingBgm = true;
    
    // Happy Birthday Melody (Notes in Hz)
    const G4 = 392.00;
    const A4 = 440.00;
    const B4 = 493.88;
    const C5 = 523.25;
    const D5 = 587.33;
    const E5 = 659.25;
    const F5 = 698.46;
    const G5 = 783.99;
    const REST = 0;

    const melody = [
        {f: G4, d: 300}, {f: G4, d: 150}, {f: A4, d: 500}, {f: G4, d: 500}, {f: C5, d: 500}, {f: B4, d: 800}, {f: REST, d: 200},
        {f: G4, d: 300}, {f: G4, d: 150}, {f: A4, d: 500}, {f: G4, d: 500}, {f: D5, d: 500}, {f: C5, d: 800}, {f: REST, d: 200},
        {f: G4, d: 300}, {f: G4, d: 150}, {f: G5, d: 500}, {f: E5, d: 500}, {f: C5, d: 500}, {f: B4, d: 500}, {f: A4, d: 800}, {f: REST, d: 200},
        {f: F5, d: 300}, {f: F5, d: 150}, {f: E5, d: 500}, {f: C5, d: 500}, {f: D5, d: 500}, {f: C5, d: 1000}, {f: REST, d: 1000}
    ];

    let noteIndex = 0;
    const playNextNote = () => {
        if (!this.isPlayingBgm) return;
        
        const note = melody[noteIndex % melody.length];
        
        if (this.ctx && note.f !== REST) {
             const melOsc = this.ctx.createOscillator();
             const melGain = this.ctx.createGain();
             melOsc.connect(melGain);
             melGain.connect(this.ctx.destination);
             melOsc.type = 'sine';
             melOsc.frequency.value = note.f;
             melGain.gain.setValueAtTime(0.05, this.ctx.currentTime);
             melGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (note.d / 1000));
             melOsc.start();
             melOsc.stop(this.ctx.currentTime + (note.d / 1000));
        }

        noteIndex++;
        this.noteTimer = window.setTimeout(playNextNote, note.d);
    };
    
    playNextNote();
  }

  stopMusic() {
    this.isPlayingBgm = false;
    this.bgmOscillators.forEach(o => {
        try { o.stop(); } catch(e){}
    });
    this.bgmOscillators = [];
    if (this.noteTimer) {
        clearTimeout(this.noteTimer);
        this.noteTimer = null;
    }
  }
}

const soundManager = new SoundManager();


// --- Main Component ---

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>('EASY');
  
  // Store top 5 scores for each difficulty
  const [highScores, setHighScores] = useState<Record<Difficulty, number[]>>({ 
    EASY: [], 
    MEDIUM: [], 
    HARD: [] 
  });
  
  const [isCakeMode, setIsCakeMode] = useState(false);
  const [cakeClicks, setCakeClicks] = useState(0);

  // Game State Refs
  const player = useRef<Player>({ x: 100, y: 250, w: 34, h: 28, dy: 0, angle: 0 });
  const pipes = useRef<Pipe[]>([]);
  const clouds = useRef<Cloud[]>([]);
  const particles = useRef<Particle[]>([]);
  const toasts = useRef<Toast[]>([]);
  const lastPipeTime = useRef(0);
  const scoreRef = useRef(0);
  
  // New Refs for features
  const keysPressed = useRef<Set<string>>(new Set());
  const backwardStreak = useRef(0);

  // Initialize Clouds and Load Scores
  useEffect(() => {
    for(let i=0; i<5; i++) {
        clouds.current.push({
            x: Math.random() * CANVAS_WIDTH,
            y: Math.random() * (CANVAS_HEIGHT / 2),
            scale: 0.5 + Math.random() * 1,
            speed: 0.2 + Math.random() * 0.5,
            type: Math.floor(Math.random() * 3)
        });
    }
    
    // Load high scores
    const saved = localStorage.getItem('flappy_nichlas_top5');
    if (saved) {
        try { 
            const parsed = JSON.parse(saved);
            if (parsed.EASY && Array.isArray(parsed.EASY)) {
                setHighScores(parsed);
            }
        } catch(e) {}
    }
  }, []);

  // Save high scores whenever they change
  useEffect(() => {
      localStorage.setItem('flappy_nichlas_top5', JSON.stringify(highScores));
  }, [highScores]);

  // Keyboard Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        keysPressed.current.add(e.code);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
        keysPressed.current.delete(e.code);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Core Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const loop = (timestamp: number) => {
      update(timestamp);
      draw(ctx);
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, difficulty, isCakeMode, highScores]); // Re-bind if these change

  const update = (timestamp: number) => {
    if (gameState === 'PLAYING') {
        const settings = DIFFICULTIES[difficulty];
        
        // Horizontal Movement (Arrow Keys)
        const horizontalSpeed = 5;
        if (keysPressed.current.has('ArrowLeft') || keysPressed.current.has('KeyA')) {
            player.current.x -= horizontalSpeed;
        }
        if (keysPressed.current.has('ArrowRight') || keysPressed.current.has('KeyD')) {
            player.current.x += horizontalSpeed;
        }
        // Clamp Player X
        player.current.x = Math.max(0, Math.min(CANVAS_WIDTH - player.current.w, player.current.x));

        // Physics
        player.current.dy += settings.gravity;
        player.current.y += player.current.dy;

        // Rotation logic
        const targetAngle = Math.min(Math.PI / 3, Math.max(-0.4, player.current.dy * 0.1));
        player.current.angle += (targetAngle - player.current.angle) * 0.2;

        // Boundaries
        if (player.current.y + player.current.h > CANVAS_HEIGHT) {
            endGame();
        }
        if (player.current.y < 0) {
            player.current.y = 0;
            player.current.dy = 0;
        }

        // Pipe Spawning
        if (timestamp - lastPipeTime.current > settings.pipeInterval) {
            spawnPipe();
            lastPipeTime.current = timestamp;
        }

        // Pipe Movement & Collision
        const activePipes: Pipe[] = [];
        
        pipes.current.forEach(pipe => {
            pipe.x -= settings.speed;

            // Collision Check
            const forgiveness = 12;
            const px = player.current.x + forgiveness;
            const py = player.current.y + forgiveness;
            const pw = player.current.w - (forgiveness * 2);
            const ph = player.current.h - (forgiveness * 2);

            const topRect = { x: pipe.x, y: 0, w: pipe.w, h: pipe.y };
            const bottomRect = { x: pipe.x, y: pipe.y + settings.gap, w: pipe.w, h: CANVAS_HEIGHT - (pipe.y + settings.gap) };

            if (
                checkRectCollide({x:px, y:py, w:pw, h:ph}, topRect) ||
                checkRectCollide({x:px, y:py, w:pw, h:ph}, bottomRect)
            ) {
                endGame();
            }

            // Forward Scoring
            if (!pipe.passed && pipe.x + pipe.w < player.current.x) {
                pipe.passed = true;
                incrementScore();
            }

            // Backward Pass Detection
            // Condition: Pipe was passed (is to left of player usually), but now player is to left of pipe
            if (pipe.passed && !pipe.passedBackward) {
                if (player.current.x + player.current.w < pipe.x) {
                    pipe.passedBackward = true;
                    backwardStreak.current += 1;
                    soundManager.playReverse();
                    
                    if (backwardStreak.current === 5) {
                        triggerBackwardBirthday();
                        backwardStreak.current = 0; // Reset or keep counting? Prompt says "5 pipes backwards in a row". 
                        // Resetting allows triggering again for next 5
                    }
                }
            }

            if (pipe.x + pipe.w > -50) {
                activePipes.push(pipe);
            }
        });
        pipes.current = activePipes;
    } else {
        // Hover animation in Start
        if (gameState === 'START') {
            player.current.y = 250 + Math.sin(Date.now() * 0.005) * 10;
            player.current.angle = 0;
        }
    }

    // Update Clouds (Parallax)
    clouds.current.forEach(cloud => {
        cloud.x -= cloud.speed;
        if (cloud.x < -100) {
            cloud.x = CANVAS_WIDTH + 100;
            cloud.y = Math.random() * (CANVAS_HEIGHT / 2);
        }
    });

    // Update Particles
    const activeParticles: Particle[] = [];
    particles.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1; // Gravity
        p.life -= 0.02;
        if (p.life > 0) activeParticles.push(p);
    });
    particles.current = activeParticles;

    // Update Toasts
    const activeToasts: Toast[] = [];
    toasts.current.forEach(t => {
        t.y -= 0.8; // Float up faster
        t.life -= 1;
        t.opacity = t.life < 20 ? t.life / 20 : 1;
        if (t.life > 0) activeToasts.push(t);
    });
    toasts.current = activeToasts;
  };

  const checkRectCollide = (r1: {x:number,y:number,w:number,h:number}, r2: {x:number,y:number,w:number,h:number}) => {
      return (
          r1.x < r2.x + r2.w &&
          r1.x + r1.w > r2.x &&
          r1.y < r2.y + r2.h &&
          r1.y + r1.h > r2.y
      );
  };

  const spawnPipe = () => {
      const settings = DIFFICULTIES[difficulty];
      const minPipe = 50;
      const maxPipe = CANVAS_HEIGHT - settings.gap - minPipe;
      
      const height = Math.floor(Math.random() * (maxPipe - minPipe + 1)) + minPipe;
      
      pipes.current.push({
          x: CANVAS_WIDTH,
          y: height, 
          w: 52,
          passed: false,
          passedBackward: false,
          id: Date.now()
      });
  };

  const spawnParticles = (x: number, y: number, type: 'SCORE' | 'CRASH') => {
      const count = type === 'SCORE' ? 20 : 40;
      const colors = type === 'SCORE' 
        ? ['#FFD700', '#FFA500', '#FFFFFF', '#2ECC71'] 
        : ['#888', '#444', '#E74C3C'];
      
      for(let i=0; i<count; i++) {
          particles.current.push({
              x, y,
              vx: (Math.random() - 0.5) * 10,
              vy: (Math.random() - 0.5) * 10,
              life: 1.0,
              color: colors[Math.floor(Math.random() * colors.length)],
              size: Math.random() * 6 + 2
          });
      }
  };

  const spawnToast = (customText?: string, color?: string) => {
      const text = customText || FUNNY_TEXTS[Math.floor(Math.random() * FUNNY_TEXTS.length)];
      toasts.current = []; 
      toasts.current.push({
          text,
          x: CANVAS_WIDTH / 2,
          y: 150,
          life: 120,
          opacity: 1,
          color: color || '#FFD700'
      });
  };

  const incrementScore = () => {
      scoreRef.current += 1;
      setScore(scoreRef.current);
      soundManager.playScore();
      spawnParticles(player.current.x, player.current.y, 'SCORE');
      spawnToast();
  };

  const triggerBackwardBirthday = () => {
      soundManager.playParty();
      spawnParticles(player.current.x, player.current.y, 'SCORE');
      spawnToast("🎂 BACKWARDS BIRTHDAY! 🎂", '#FF00FF');
  };

  const endGame = () => {
      setGameState('GAME_OVER');
      soundManager.playCrash();
      soundManager.stopMusic();
      spawnParticles(player.current.x, player.current.y, 'CRASH');
      
      // Update Top 5 High Scores
      setHighScores(prev => {
          const currentDiffScores = [...prev[difficulty]];
          currentDiffScores.push(scoreRef.current);
          // Sort descending (highest first)
          currentDiffScores.sort((a, b) => b - a);
          // Keep top 5
          const top5 = currentDiffScores.slice(0, 5);
          return {
              ...prev,
              [difficulty]: top5
          };
      });
  };

  const startGame = () => {
      soundManager.init();
      soundManager.resume();
      soundManager.startMusic();
      // Reset
      player.current = { x: 100, y: 250, w: 34, h: 28, dy: 0, angle: 0 };
      pipes.current = [];
      particles.current = [];
      toasts.current = [];
      backwardStreak.current = 0;
      scoreRef.current = 0;
      setScore(0);
      lastPipeTime.current = 0;
      setGameState('PLAYING');
  };

  const handleInput = (e: React.MouseEvent | React.TouchEvent) => {
      if (gameState === 'PLAYING') {
          const settings = DIFFICULTIES[difficulty];
          player.current.dy = settings.jump;
          soundManager.playJump();
          
          particles.current.push({
              x: player.current.x,
              y: player.current.y + player.current.h,
              vx: -1, vy: 1, life: 0.5, color: 'white', size: 3
          });
      }
  };

  const handleCakeTrigger = () => {
      const newClicks = cakeClicks + 1;
      setCakeClicks(newClicks);
      if (newClicks === 5) {
          setIsCakeMode(true);
          soundManager.playParty();
          spawnParticles(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 'SCORE');
      }
  };

  // --- Drawing ---

  const draw = (ctx: CanvasRenderingContext2D) => {
      // Background
      ctx.fillStyle = '#70c5ce';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Clouds
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      clouds.current.forEach(c => {
          ctx.beginPath();
          ctx.arc(c.x, c.y, 30 * c.scale, 0, Math.PI * 2);
          ctx.arc(c.x + 25 * c.scale, c.y - 10 * c.scale, 35 * c.scale, 0, Math.PI * 2);
          ctx.arc(c.x + 50 * c.scale, c.y, 30 * c.scale, 0, Math.PI * 2);
          ctx.fill();
      });

      // Pipes
      const settings = DIFFICULTIES[difficulty];
      pipes.current.forEach(pipe => {
          drawPipe(ctx, pipe.x, 0, pipe.w, pipe.y, true); 
          drawPipe(ctx, pipe.x, pipe.y + settings.gap, pipe.w, CANVAS_HEIGHT - (pipe.y + settings.gap), false); 
      });

      // Ground
      ctx.fillStyle = '#ded895';
      ctx.fillRect(0, CANVAS_HEIGHT - 20, CANVAS_WIDTH, 20);
      ctx.fillStyle = '#73bf2e';
      ctx.fillRect(0, CANVAS_HEIGHT - 20, CANVAS_WIDTH, 4);

      // Player
      drawPlayer(ctx);

      // Particles
      particles.current.forEach(p => {
          ctx.globalAlpha = p.life;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y, p.size, p.size);
          ctx.globalAlpha = 1;
      });

      // Toasts
      ctx.font = 'bold 28px "Comic Sans MS", cursive, sans-serif';
      ctx.lineWidth = 5;
      ctx.textAlign = 'center';
      toasts.current.forEach(t => {
          ctx.fillStyle = t.color || '#FFD700';
          ctx.strokeStyle = '#000';
          ctx.globalAlpha = t.opacity;
          ctx.strokeText(t.text, t.x, t.y);
          ctx.fillText(t.text, t.x, t.y);
          ctx.globalAlpha = 1;
      });
  };

  const drawPipe = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, isTop: boolean) => {
      if (isCakeMode) {
          const layers = Math.ceil(h / 20);
          for(let i=0; i<layers; i++) {
              const ly = isTop ? (y + h - 20 - i*20) : (y + i*20);
              if (ly < y && !isTop) break;
              if (ly < y && isTop) continue;

              const colors = ['#8B4513', '#F5DEB3', '#FF69B4'];
              ctx.fillStyle = colors[i % 3];
              ctx.fillRect(x, ly, w, 20);
              
              ctx.fillStyle = '#FFF';
              ctx.fillRect(x, ly, w, 5);
          }
          if (!isTop) {
              ctx.fillStyle = '#F00';
              ctx.fillRect(x + 10, y - 10, 4, 10);
              ctx.fillStyle = '#FF0';
              ctx.beginPath();
              ctx.arc(x + 12, y - 12, 3 + Math.random()*2, 0, Math.PI*2);
              ctx.fill();
          }
      } else {
          const grad = ctx.createLinearGradient(x, 0, x + w, 0);
          grad.addColorStop(0, '#73bf2e');
          grad.addColorStop(0.5, '#9ce659');
          grad.addColorStop(1, '#558c22');
          
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, w, h);
          
          ctx.fillStyle = '#558c22';
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 2;
          const rimY = isTop ? y + h - 24 : y;
          ctx.fillRect(x - 2, rimY, w + 4, 24);
          ctx.strokeRect(x - 2, rimY, w + 4, 24);
          
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.fillRect(x, rimY + 2, 4, 20);
      }
  };

  const drawPlayer = (ctx: CanvasRenderingContext2D) => {
      const pl = player.current;
      const cx = pl.x + pl.w / 2;
      const cy = pl.y + pl.h / 2;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(pl.angle);

      const offX = -pl.w / 2;
      const offY = -pl.h / 2;

      // Flag
      ctx.fillStyle = '#555';
      ctx.fillRect(offX - 2, offY, 4, 30);
      ctx.fillStyle = '#C60C30';
      ctx.fillRect(offX - 26, offY, 24, 16);
      ctx.fillStyle = '#FFF';
      ctx.fillRect(offX - 14, offY, 4, 16);
      ctx.fillRect(offX - 26, offY + 6, 24, 4);

      // Body
      ctx.fillStyle = '#E74C3C'; 
      ctx.fillRect(offX, offY, pl.w, pl.h);
      
      // Face
      ctx.fillStyle = '#F5B041';
      ctx.fillRect(offX + pl.w - 8, offY + 14, 12, 8);
      
      // Eye
      ctx.fillStyle = '#FFF';
      ctx.fillRect(offX + pl.w - 12, offY + 4, 10, 10);
      ctx.fillStyle = '#000';
      ctx.fillRect(offX + pl.w - 8, offY + 6, 4, 4);

      // Wing
      let wingOffset = 0;
      const time = Date.now();
      if (gameState === 'START') {
          wingOffset = Math.sin(time * 0.01) * 3;
      } else if (gameState === 'PLAYING') {
          if (pl.dy < 0) {
             wingOffset = Math.sin(time * 0.03) * 6;
          } else {
             wingOffset = -2;
          }
      }

      ctx.fillStyle = '#ecf0f1';
      ctx.beginPath();
      ctx.ellipse(offX + 16, offY + 18 + wingOffset, 10, 6, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
  };

  return (
    <div 
        style={{ 
            width: '100vw', 
            height: '100vh', 
            backgroundColor: '#333', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            position: 'relative'
        }}
        onMouseDown={handleInput}
        onTouchStart={handleInput}
    >
      <canvas 
          ref={canvasRef} 
          width={CANVAS_WIDTH} 
          height={CANVAS_HEIGHT} 
          style={{ 
              maxWidth: '100%', 
              maxHeight: '100%', 
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
              borderRadius: '8px',
              cursor: 'pointer'
          }}
      />

      {/* UI Layer */}
      <div style={{
          position: 'absolute',
          top: 20,
          left: 0,
          width: '100%',
          textAlign: 'center',
          pointerEvents: 'none',
          fontFamily: '"Courier New", monospace',
          fontWeight: 'bold',
          fontSize: '40px',
          color: 'white',
          textShadow: '2px 2px 0 #000'
      }}>
          {score}
      </div>

      {/* Start Screen */}
      {gameState === 'START' && (
          <div style={{
              position: 'absolute',
              backgroundColor: 'rgba(255,255,255,0.95)',
              padding: '30px',
              borderRadius: '16px',
              textAlign: 'center',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              border: '4px solid #E74C3C',
              maxHeight: '90%',
              overflowY: 'auto'
          }}>
              <h1 
                  onClick={handleCakeTrigger}
                  style={{ 
                      color: '#E74C3C', 
                      fontSize: '48px', 
                      margin: '0 0 20px 0',
                      cursor: 'default',
                      userSelect: 'none',
                      textShadow: '2px 2px 0px rgba(0,0,0,0.1)'
                  }}
              >
                  {isCakeMode ? "🎂 PARTY NICHLAS 🎂" : "FLAPPY NICHLAS"}
              </h1>
              
              <div style={{ marginBottom: '20px' }}>
                  <p style={{marginBottom:'10px', fontWeight:'bold', color:'#555'}}>DIFFICULTY</p>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                      {(['EASY', 'MEDIUM', 'HARD'] as Difficulty[]).map(d => (
                          <button
                              key={d}
                              onClick={() => setDifficulty(d)}
                              style={{
                                  padding: '8px 16px',
                                  backgroundColor: difficulty === d ? '#E74C3C' : '#eee',
                                  color: difficulty === d ? 'white' : '#555',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontWeight: 'bold',
                                  transform: difficulty === d ? 'scale(1.1)' : 'scale(1)',
                                  transition: 'all 0.2s',
                                  boxShadow: difficulty === d ? '0 2px 5px rgba(0,0,0,0.2)' : 'none'
                              }}
                          >
                              {d}
                          </button>
                      ))}
                  </div>
                  <div style={{marginTop: '10px', fontSize: '12px', color: '#666'}}>
                    Brug Pile-tasterne/A-D for at flyve frem og tilbage!
                  </div>
              </div>

              {/* Scoreboard */}
              <div style={{ 
                  marginTop: '15px', 
                  background: '#f9f9f9', 
                  padding: '15px', 
                  borderRadius: '8px',
                  border: '1px solid #ddd'
              }}>
                  <h3 style={{ margin: '0 0 10px 0', color: '#D35400', fontSize: '20px' }}>🏆 TOP 5 ({difficulty}) 🏆</h3>
                  {highScores[difficulty].length === 0 ? (
                      <div style={{color: '#999', fontStyle: 'italic'}}>Ingen rekorder endnu!</div>
                  ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {highScores[difficulty].map((s, i) => (
                              <div key={i} style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  width: '220px',
                                  margin: '0 auto',
                                  fontWeight: i === 0 ? 'bold' : 'normal',
                                  color: i === 0 ? '#E67E22' : '#555',
                                  borderBottom: i < 4 ? '1px dashed #eee' : 'none',
                                  paddingBottom: i < 4 ? '4px' : '0'
                              }}>
                                  <span>#{i+1}</span>
                                  <span>{s} point{s !== 1 ? 's' : ''}</span>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
              
              <button 
                  onClick={startGame}
                  style={{
                      padding: '15px 40px',
                      fontSize: '24px',
                      backgroundColor: '#27AE60',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      marginTop: '20px',
                      boxShadow: '0 4px 0 #219150',
                      fontWeight: 'bold'
                  }}
              >
                  START SPIL
              </button>
          </div>
      )}

      {/* Game Over Screen */}
      {gameState === 'GAME_OVER' && (
          <div style={{
              position: 'absolute',
              backgroundColor: 'rgba(0,0,0,0.85)',
              padding: '40px',
              borderRadius: '16px',
              textAlign: 'center',
              color: 'white',
              border: '2px solid #E74C3C',
              maxWidth: '90%'
          }}>
              <h2 style={{ fontSize: '32px', color: '#f1c40f', margin: '0 0 10px 0', textShadow: '2px 2px 0 #000' }}>FLAPPY NICHLAS</h2>
              <h2 style={{ fontSize: '48px', color: '#E74C3C', margin: '0 0 10px 0', textShadow: '2px 2px 0 #000' }}>GAME OVER</h2>
              <div style={{ fontSize: '22px', color: '#fff', margin: '10px 0 20px 0', fontStyle: 'italic' }}>
                  "Marcus kommer og løfter dig op!"
              </div>
              
              <div style={{ fontSize: '28px', marginBottom: '20px' }}>
                  Score: {score} <br/>
                  <div style={{marginTop: '10px', fontSize: '18px', color: '#f1c40f'}}>
                    Top Score: {highScores[difficulty].length > 0 ? highScores[difficulty][0] : score}
                  </div>
              </div>
              <button 
                  onClick={startGame}
                  style={{
                      padding: '15px 40px',
                      fontSize: '24px',
                      backgroundColor: '#3498DB',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 0 #2980B9',
                      fontWeight: 'bold'
                  }}
              >
                  PRØV IGEN
              </button>
          </div>
      )}
    </div>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<Game />);
}