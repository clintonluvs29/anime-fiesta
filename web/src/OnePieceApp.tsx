import React, { useCallback, useRef, useState } from 'react';

/**
 * One Piece Character Generator App
 * - Generates 16 anime-style variations of One Piece characters/scenes
 * - Features character-focused refinements and style options
 * - Circular layout with streaming animations
 * - Hero view with character-specific refinement options
 */

// Utility function for safe error message extraction
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unknown error occurred';
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/+$/,'') : '';

// One Piece character options
const ONE_PIECE_CHARACTERS = [
  'Monkey D. Luffy', 'Roronoa Zoro', 'Nami', 'Usopp', 'Sanji',
  'Tony Tony Chopper', 'Nico Robin', 'Franky', 'Brook', 'Jimbei',
  'Shanks', 'Portgas D. Ace', 'Trafalgar Law', 'Boa Hancock',
  'Edward Newgate', 'Marco', 'Jinbe', 'Doflamingo',
  'Katakuri', 'Kaido', 'Big Mom', 'Blackbeard'
];

// One Piece style options
const ONE_PIECE_STYLES = [
  'Eiichiro Oda art style',
  'Official manga style',
  'Anime key visual style',
  'Wanted poster style',
  'Volume cover art',
  'Color spread style',
  'Dynamic action pose',
  'Emotional close-up',
  'Crew group shot',
  'Devil Fruit power',
  'Haki activation',
  'Gear transformation',
  'Battle scene',
  'Comedic moment',
  'Dramatic scene'
];

// One Piece scene suggestions
const ONE_PIECE_SUGGESTIONS = [
  'Luffy using Gear 5',
  'Zoro fighting with three swords',
  'Nami drawing a map',
  'Sanji cooking',
  'Chopper in doctor mode',
  'Robin using her powers',
  'Franky building something',
  'Brook playing violin',
  'Shanks stopping the war',
  'Ace protecting Luffy',
  'Law using Room',
  'Hancock being elegant',
  'Whitebeard in battle',
  'Marco using phoenix flames',
  'Kaido in dragon form'
];

// Refinement options specific to One Piece
const ONE_PIECE_REFINEMENTS = [
  { label: 'More Action', value: 'dynamic action pose, intense battle scene', lockSeed: true },
  { label: 'More Detailed', value: 'intricate linework, detailed shading', lockSeed: true },
  { label: 'More Colorful', value: 'vibrant anime colors, rich palette', lockSeed: true },
  { label: 'More Manga Style', value: 'black and white, manga panel style', lockSeed: true },
  { label: 'More Emotional', value: 'dramatic close-up, emotional expression', lockSeed: true },
  { label: 'More Comedic', value: 'chibi style, exaggerated expression', lockSeed: true },
  { label: 'More Background', value: 'detailed background, location setting', lockSeed: true },
  { label: 'More Power', value: 'Devil Fruit ability activation, energy effects', lockSeed: true },
  { label: 'More Crew', value: 'with Straw Hat crew members', lockSeed: false },
  { label: 'More Villain', value: 'featuring antagonist characters', lockSeed: false },
  { label: 'More Marine', value: 'with Marine characters', lockSeed: false },
  { label: 'More Wanted Poster', value: 'wanted poster style, bounty display', lockSeed: true },
  { label: 'More Gear', value: 'Gear transformation, power up', lockSeed: true },
  { label: 'More Haki', value: 'using Haki, aura effects', lockSeed: true },
  { label: 'More Ship', value: 'on the Thousand Sunny', lockSeed: true },
  { label: 'More Variations', value: 'same concept, different interpretation', lockSeed: false }
];

type AnimeImage = {
  id: string;
  url: string;
  prompt: string;
  loadTime: number;
  aspectRatio?: number;
};

type GenerationSession = {
  id: string;
  basePrompt: string;
  character: string;
  style: string;
  images: AnimeImage[];
  generating: boolean;
  progress: number;
  sse?: EventSource | null;
  error?: string | null;
  seed?: number;
};

export default function OnePieceApp() {
  // Core app state
  const [prompt, setPrompt] = useState(() => {
    return ONE_PIECE_SUGGESTIONS[Math.floor(Math.random() * ONE_PIECE_SUGGESTIONS.length)];
  });
  const [selectedCharacter, setSelectedCharacter] = useState(() => {
    return ONE_PIECE_CHARACTERS[Math.floor(Math.random() * ONE_PIECE_CHARACTERS.length)];
  });
  const [selectedStyle, setSelectedStyle] = useState(() => {
    return ONE_PIECE_STYLES[Math.floor(Math.random() * ONE_PIECE_STYLES.length)];
  });
  const [currentSession, setCurrentSession] = useState<GenerationSession | null>(null);
  const [heroImage, setHeroImage] = useState<AnimeImage | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroSession, setHeroSession] = useState<GenerationSession | null>(null);
  const [sessionHistory, setSessionHistory] = useState<GenerationSession[]>([]);

  const liveRegionRef = useRef<HTMLDivElement>(null);
  const sessionCounter = useRef(0);
  const imageCounter = useRef(0);

  const nextSessionId = () => `op_session_${++sessionCounter.current}`;
  const nextImageId = () => `op_image_${++imageCounter.current}`;

  const announce = useCallback((message: string) => {
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = message;
      setTimeout(() => {
        if (liveRegionRef.current) liveRegionRef.current.textContent = '';
      }, 600);
    }
  }, []);

  const startHeroGeneration = useCallback(async (basePrompt: string, character: string, style: string, refinement: string, seed?: number) => {
    heroSession?.sse?.close();

    const sessionId = nextSessionId();
    const newSession: GenerationSession = {
      id: sessionId,
      basePrompt,
      character,
      style,
      images: [],
      generating: true,
      progress: 0,
      error: null,
      seed
    };

    setHeroSession(newSession);
    announce('Generating 16 One Piece variations...');

    try {
      const resp = await fetch(`${API_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: basePrompt,
          character,
          style,
          refinement,
          seed: seed !== undefined ? seed : undefined
        })
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      }

      const { projectId } = await resp.json();
      const es = new EventSource(`${API_BASE}/api/progress/${projectId}`);

      es.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          setHeroSession(prev => {
            if (!prev || prev.id !== sessionId) return prev;

            if (data.type === 'jobCompleted' && data.job?.resultUrl) {
              const newImage: AnimeImage = {
                id: nextImageId(),
                url: data.job.resultUrl,
                prompt: data.job.positivePrompt || basePrompt,
                loadTime: Date.now()
              };
              const updatedImages = [...prev.images, newImage];
              announce(`${updatedImages.length} of 16 ready`);
              return { ...prev, images: updatedImages };
            }

            if (data.type === 'completed') {
              es.close();
              announce('All variations complete!');
              return { ...prev, generating: false, sse: null };
            }

            return prev;
          });
        } catch (parseError) {
          console.error('Failed to parse SSE data:', parseError);
        }
      };

      es.onerror = () => {
        es.close();
        setHeroSession(prev => prev ? { 
          ...prev, 
          generating: false, 
          error: 'Connection error' 
        } : null);
      };

      setHeroSession(prev => prev ? { ...prev, sse: es } : null);
    } catch (err) {
      setHeroSession(prev => prev ? { 
        ...prev, 
        generating: false, 
        error: getErrorMessage(err) 
      } : null);
    }
  }, [heroSession?.sse, announce]);

  const startGeneration = useCallback(async (basePrompt: string, character: string, style: string) => {
    currentSession?.sse?.close();

    const sessionId = nextSessionId();
    const sessionSeed = Math.floor(Math.random() * 1000000);

    const newSession: GenerationSession = {
      id: sessionId,
      basePrompt,
      character,
      style,
      images: [],
      generating: true,
      progress: 0,
      error: null,
      seed: sessionSeed
    };

    setCurrentSession(newSession);
    setHeroImage(null);
    announce('Generating 16 One Piece images...');

    try {
      const resp = await fetch(`${API_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: basePrompt,
          character,
          style
        })
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      }

      const { projectId } = await resp.json();
      const es = new EventSource(`${API_BASE}/api/progress/${projectId}`);

      es.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          setCurrentSession(prev => {
            if (!prev || prev.id !== sessionId) return prev;

            if (data.type === 'jobCompleted' && data.job?.resultUrl) {
              const newImage: AnimeImage = {
                id: nextImageId(),
                url: data.job.resultUrl,
                prompt: data.job.positivePrompt || basePrompt,
                loadTime: Date.now()
              };
              announce(`${newImage.id} ready`);
              return { ...prev, images: [...prev.images, newImage] };
            }

            if (data.type === 'completed') {
              es.close();
              setSessionHistory(history => [prev, ...history.slice(0, 9)]);
              return { ...prev, generating: false, sse: null };
            }

            return prev;
          });
        } catch (parseError) {
          console.error('Failed to parse SSE data:', parseError);
        }
      };

      es.onerror = () => {
        es.close();
        setCurrentSession(prev => prev ? { 
          ...prev, 
          generating: false, 
          error: 'Connection error' 
        } : null);
      };

      setCurrentSession(prev => prev ? { ...prev, sse: es } : null);
    } catch (err) {
      setCurrentSession(prev => prev ? { 
        ...prev, 
        generating: false, 
        error: getErrorMessage(err) 
      } : null);
    }
  }, [currentSession?.sse, announce]);

  const handleGenerate = () => {
    if (prompt.trim()) {
      startGeneration(prompt.trim(), selectedCharacter, selectedStyle);
    }
  };

  const handleRefinementClick = (option: typeof ONE_PIECE_REFINEMENTS[0]) => {
    if (!heroImage || !currentSession) return;
    const seed = option.lockSeed ? currentSession.seed : -1;
    startHeroGeneration(heroImage.prompt, selectedCharacter, selectedStyle, option.value, seed);
  };

  const handleImageClick = (image: AnimeImage) => {
    if (!currentSession) return;
    const index = currentSession.images.findIndex(img => img.id === image.id);
    setHeroImage(image);
    setHeroIndex(index);
    setHeroSession(null);
  };

  const navigateHero = (direction: 'prev' | 'next') => {
    const activeSession = heroSession || currentSession;
    if (!activeSession) return;

    const newIndex = direction === 'prev' 
      ? (heroIndex > 0 ? heroIndex - 1 : activeSession.images.length - 1)
      : (heroIndex < activeSession.images.length - 1 ? heroIndex + 1 : 0);

    setHeroIndex(newIndex);
    setHeroImage(activeSession.images[newIndex]);
  };

  const handleSuggest = () => {
    setPrompt(ONE_PIECE_SUGGESTIONS[Math.floor(Math.random() * ONE_PIECE_SUGGESTIONS.length)]);
  };

  const closeHeroMode = () => setHeroImage(null);
  const exitRefinementMode = () => setHeroSession(null);

  return (
    <div className="one-piece-app">
      <div aria-live="polite" aria-atomic="true" className="sr-only" ref={liveRegionRef} />

      {heroImage && (
        <div className="hero-mode">
          <div className="hero-center">
            <img src={heroImage.url} alt="Selected One Piece artwork" />
            {heroSession?.generating && <div className="loading-spinner"></div>}
            
            {!heroSession ? (
              <div className="hero-prompt">
                <strong>{heroImage.prompt}</strong>
                <button onClick={closeHeroMode}>×</button>
              </div>
            ) : (
              <div className="refinement-header">
                <strong>Refinement: {heroSession.images[0]?.prompt.replace(heroImage.prompt, '').trim()}</strong>
                <button onClick={exitRefinementMode}>×</button>
              </div>
            )}
          </div>

          <button className="nav-btn prev" onClick={() => navigateHero('prev')}>←</button>
          <button className="nav-btn next" onClick={() => navigateHero('next')}>→</button>

          <div className="counter">
            {heroIndex + 1} / {(heroSession || currentSession)?.images.length || 0}
          </div>

          {!heroSession ? (
            <div className="refinement-grid">
              {ONE_PIECE_REFINEMENTS.map((option, i) => (
                <div 
                  key={option.label}
                  className="refinement-option"
                  style={{ '--hue': i * 24 }}
                  onClick={() => handleRefinementClick(option)}
                >
                  {option.label}
                </div>
              ))}
            </div>
          ) : (
            <div className="variations-orbit">
              {heroSession.images.map((img, i) => (
                <div 
                  key={img.id}
                  className="orbit-item"
                  style={{ '--angle': i * 22.5 }}
                  onClick={() => {
                    setHeroIndex(i);
                    setHeroImage(img);
                  }}
                >
                  <img src={img.url} alt={`Variation ${i + 1}`} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!heroImage && (
        <div className="main-ui">
          <div className="header">
            <h1>One Piece Character Generator</h1>
          </div>

          <div className="controls">
            <div className="input-group">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe a One Piece scene..."
              />
              <button onClick={handleSuggest}>🎲</button>
            </div>

            <select 
              value={selectedCharacter}
              onChange={(e) => setSelectedCharacter(e.target.value)}
            >
              {ONE_PIECE_CHARACTERS.map(char => (
                <option key={char} value={char}>{char}</option>
              ))}
            </select>

            <select
              value={selectedStyle}
              onChange={(e) => setSelectedStyle(e.target.value)}
            >
              {ONE_PIECE_STYLES.map(style => (
                <option key={style} value={style}>{style}</option>
              ))}
            </select>

            <button 
              onClick={handleGenerate}
              disabled={!prompt.trim() || currentSession?.generating}
            >
              {currentSession?.generating ? 'Generating...' : 'Create'}
            </button>
          </div>

          {currentSession?.error && (
            <div className="error">{currentSession.error}</div>
          )}

          {currentSession && (
            <div className="character-wheel">
              {currentSession.images.map((img, i) => (
                <div
                  key={img.id}
                  className="wheel-item"
                  style={{ '--angle': i * 22.5 }}
                  onClick={() => handleImageClick(img)}
                >
                  <img src={img.url} alt={`One Piece ${i + 1}`} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}