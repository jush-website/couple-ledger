import { useState, useEffect, useRef } from 'react';
import { Mic, Loader2, X, RefreshCcw } from 'lucide-react';
import ModalLayout from './ModalLayout.jsx';
import { SpeechRecognition } from '../lib/speech.js';

const EXAMPLES = [
  '昨天晚餐六百八，我付的，平分',
  '午餐 120',
  '計程車兩百五，他付的',
  '買衣服一千二，我自己的',
];

const ERROR_MESSAGES = {
  'not-allowed': '沒有麥克風權限。請到瀏覽器的網站設定把麥克風打開。',
  'service-not-allowed': '沒有麥克風權限。請到瀏覽器的網站設定把麥克風打開。',
  'no-speech': '沒有聽到聲音，再試一次。',
  'audio-capture': '找不到麥克風。',
  network: '聽寫服務連線失敗，檢查一下網路。',
};

const VoiceEntryModal = ({ role, onClose, onConfirm }) => {
  const [step, setStep] = useState('idle'); // idle | listening | parsing
  const [transcript, setTranscript] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const recognitionRef = useRef(null);
  // 停止聽寫有兩種原因：使用者按了停、或講完自動結束。
  // 只有後者要接著送出去解析，用 ref 記著避免 onend 誤觸發。
  const shouldSubmitRef = useRef(false);

  const parse = async (text) => {
    setStep('parsing');
    setErrorMsg(null);
    try {
      const response = await fetch('/api/parse-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          role,
          // 伺服器在 UTC，深夜記帳會算成隔天，所以日期由這邊算好帶過去
          today: new Date().toLocaleDateString('en-CA'),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `解析服務錯誤 (${response.status})`);
      onConfirm(data);
    } catch (e) {
      console.error(e);
      setErrorMsg(e.message || '解析失敗');
      setStep('idle');
    }
  };

  const start = () => {
    if (!SpeechRecognition) return;
    setTranscript('');
    setErrorMsg(null);

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-TW';
    recognition.continuous = false;
    recognition.interimResults = true; // 邊講邊顯示，使用者才知道有沒有聽到

    let finalText = '';
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += chunk;
        else interim += chunk;
      }
      setTranscript(finalText + interim);
    };
    recognition.onerror = (event) => {
      shouldSubmitRef.current = false;
      setErrorMsg(ERROR_MESSAGES[event.error] || `聽寫失敗（${event.error}）`);
      setStep('idle');
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setStep((prev) => (prev === 'listening' ? 'idle' : prev));
      const text = finalText.trim();
      if (shouldSubmitRef.current && text) parse(text);
      shouldSubmitRef.current = false;
    };

    shouldSubmitRef.current = true;
    recognitionRef.current = recognition;
    recognition.start();
    setStep('listening');
  };

  const stop = ({ submit }) => {
    shouldSubmitRef.current = submit;
    recognitionRef.current?.stop();
  };

  // 關掉視窗時一定要收掉麥克風，不然錄音指示燈會一直亮著
  useEffect(
    () => () => {
      shouldSubmitRef.current = false;
      recognitionRef.current?.abort();
    },
    []
  );

  return (
    <ModalLayout title="語音記帳" onClose={onClose}>
      <div className="flex flex-col items-center justify-center min-h-64 gap-4 py-4">
        {step === 'parsing' ? (
          <>
            <Loader2 size={48} className="animate-spin text-purple-500" />
            <h3 className="font-bold text-gray-800">正在整理成一筆帳...</h3>
            <p className="text-sm text-gray-500 text-center px-4">「{transcript}」</p>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={step === 'listening' ? () => stop({ submit: true }) : start}
              aria-label={step === 'listening' ? '結束並辨識' : '開始說話'}
              className={`w-24 h-24 rounded-full flex items-center justify-center transition-all active:scale-95 ${
                step === 'listening'
                  ? 'bg-red-500 text-surface shadow-lg animate-pulse'
                  : 'bg-purple-600 text-surface shadow-lg shadow-purple-200'
              }`}
            >
              <Mic size={40} />
            </button>

            <p className="text-sm font-bold text-gray-600">
              {step === 'listening' ? '聽著呢，講完再按一次' : '按住說一句話就好'}
            </p>

            {transcript && (
              <p className="text-base font-bold text-gray-800 text-center px-4 animate-[fadeIn_0.2s]">
                「{transcript}」
              </p>
            )}

            {errorMsg && (
              <div className="w-full bg-red-50 rounded-xl p-3 flex items-start gap-2 animate-[fadeIn_0.2s]">
                <X size={16} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-500 leading-relaxed flex-1">{errorMsg}</p>
                {transcript && (
                  <button
                    type="button"
                    onClick={() => parse(transcript)}
                    className="text-xs font-bold text-gray-600 flex items-center gap-1 shrink-0"
                  >
                    <RefreshCcw size={12} /> 重試
                  </button>
                )}
              </div>
            )}

            {step === 'idle' && !transcript && (
              <div className="w-full bg-gray-50 rounded-xl p-3 mt-2">
                <p className="text-[10px] font-bold text-gray-400 mb-2">可以這樣說</p>
                <ul className="space-y-1">
                  {EXAMPLES.map((e) => (
                    <li key={e} className="text-xs text-gray-500">
                      「{e}」
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </ModalLayout>
  );
};

export default VoiceEntryModal;
