// FakeRadio — thin app shell. Picks a skin, owns avatar upload + tweaks.
const { useRef, useState } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "amber",
  "persona": "midnight"
}/*EDITMODE-END*/;

const SKINS = {
  amber:    { label: "暖橙胶片 (默认)", render: () => window.SkinAmber },
  pixel:    { label: "像素 Game Boy",    render: () => window.SkinPixel },
  terminal: { label: "终端 TUI",         render: () => window.SkinTerminal },
  bento:    { label: "Bento 玻璃",       render: () => window.SkinBento },
  y2k:      { label: "Y2K / Win98",      render: () => window.SkinY2K }
};

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const persona = PERSONAS[t.persona] || PERSONAS.midnight;
  const r = useRadio(persona);

  const [avatarSrc, setAvatarSrc] = useState(null);
  const fileRef = useRef(null);
  const onAvatarUpload = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => setAvatarSrc(rd.result);
    rd.readAsDataURL(f);
  };
  const openAvatar = () => fileRef.current?.click();

  const SkinView = (SKINS[t.theme] || SKINS.amber).render() || window.SkinAmber;

  return (
    <div className="stage" data-skin={t.theme}>
      <SkinView r={r} persona={persona} avatarSrc={avatarSrc} onAvatarClick={openAvatar} />

      <TweaksPanel>
        <TweakSection label="主题风格" />
        <TweakSelect
          label="Theme"
          value={t.theme}
          options={Object.keys(SKINS).map((k) => ({ value: k, label: SKINS[k].label }))}
          onChange={(v) => setTweak("theme", v)} />

        <TweakSection label="DJ 头像" />
        <button
          className="twk-upload"
          style={{ appearance: "none", border: "1px dashed rgba(0,0,0,0.2)", background: "transparent", color: "inherit", padding: "8px 10px", borderRadius: 8, cursor: "pointer", fontSize: 11, textAlign: "left" }}
          onClick={openAvatar}>
          {avatarSrc ? "更换照片" : "上传一张照片做头像"}
        </button>
        {avatarSrc && (
          <button
            style={{ appearance: "none", border: 0, background: "transparent", color: "rgba(41,38,27,0.55)", padding: "4px 0 0", cursor: "pointer", fontSize: 11, textAlign: "left" }}
            onClick={() => setAvatarSrc(null)}>
            移除,改回默认
          </button>
        )}

        <TweakSection label="DJ 人设" />
        <TweakSelect
          label="Persona"
          value={t.persona}
          options={[
            { value: "midnight", label: "午夜深夜电台 · 阿夜" },
            { value: "morning", label: "清晨陪伴 · 晓" },
            { value: "buddy", label: "话痨好友" },
            { value: "cool", label: "极简冷淡" }
          ]}
          onChange={(v) => { r.seedReset(); setTweak("persona", v); }} />
      </TweaksPanel>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatarUpload} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
