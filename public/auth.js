(function () {
  const client = window.getMiniChatrouletteSupabaseClient?.();

  if (!client) return;

  const body = document.body;
  const authModal = document.getElementById("authModal");
  const authClose = document.getElementById("authClose");
  const authStatus = document.getElementById("authStatus");
  const authToggleDesktop = document.getElementById("authToggleDesktop");
  const authToggleMobile = document.getElementById("authToggleMobile");
  const authPanels = Array.from(document.querySelectorAll("[data-auth-panel]"));
  const authSwitchButtons = Array.from(document.querySelectorAll("[data-auth-switch]"));

  const loginEmail = document.getElementById("loginEmail");
  const loginPassword = document.getElementById("loginPassword");
  const loginSubmit = document.getElementById("loginSubmit");

  const registerEmail = document.getElementById("registerEmail");
  const registerPassword = document.getElementById("registerPassword");
  const registerPasswordRepeat = document.getElementById("registerPasswordRepeat");
  const registerSubmit = document.getElementById("registerSubmit");
  const forgotEmail = document.getElementById("forgotEmail");
  const forgotSubmit = document.getElementById("forgotSubmit");
  const resetPassword = document.getElementById("resetPassword");
  const resetPasswordRepeat = document.getElementById("resetPasswordRepeat");
  const resetSubmit = document.getElementById("resetSubmit");

  const profileUsername = document.getElementById("profileUsername");
  const profileDisplayName = document.getElementById("profileDisplayName");
  const profilePhoneNumber = document.getElementById("profilePhoneNumber");
  const profileAge = document.getElementById("profileAge");
  const profileCity = document.getElementById("profileCity");
  const profileCountry = document.getElementById("profileCountry");
  const profileBio = document.getElementById("profileBio");
  const profileAvatarPreview = document.getElementById("profileAvatarPreview");
  const profileAvatarInput = document.getElementById("profileAvatarInput");
  const profileAvatarPick = document.getElementById("profileAvatarPick");
  const profileAvatarStatus = document.getElementById("profileAvatarStatus");
  const profileStatusInline = document.getElementById("profileStatusInline");
  const profileSave = document.getElementById("profileSave");
  const profileChangePassword = document.getElementById("profileChangePassword");
  const logoutSubmit = document.getElementById("logoutSubmit");
  const authProfileSummary = document.getElementById("authProfileSummary");
  const authInboxList = document.getElementById("authInboxList");
  const mobileSettingsGuestCard = document.getElementById("mobileSettingsGuestCard");
  const mobileSettingsAccountCard = document.getElementById("mobileSettingsAccountCard");
  const mobileSettingsAccountBtn = document.getElementById("mobileSettingsAccountBtn");
  const mobileSettingsItems = Array.from(document.querySelectorAll("[data-settings-item]"));
  const mobileAuthProfileSummary = document.getElementById("mobileAuthProfileSummary");
  const mobileProfileUsername = document.getElementById("mobileProfileUsername");
  const mobileProfileDisplayName = document.getElementById("mobileProfileDisplayName");
  const mobileProfilePhoneNumber = document.getElementById("mobileProfilePhoneNumber");
  const mobileProfileSave = document.getElementById("mobileProfileSave");
  const mobileSettingsLogoutBtn = document.getElementById("mobileSettingsLogoutBtn");
  const mobileSettingsStatus = document.getElementById("mobileSettingsStatus");

  const genderInput = document.getElementById("gender");
  const searchInput = document.getElementById("search");
  const locationInput = document.getElementById("locationText");

  let activeTab = "login";
  let currentSession = null;
  let currentProfile = null;
  let profileSaveInFlight = false;
  let pendingAvatarUrl = null;
  let resetReturnTab = "login";
  let passwordChangeInFlight = false;
  let authHistoryOpen = false;

  function setStatus(message = "", type = "") {
    const isProfileContext = activeTab === "profile";

    if (authStatus && !isProfileContext) {
      authStatus.textContent = message;
      authStatus.className = "auth-status";
      if (type) authStatus.classList.add(type);
    }
    if (profileStatusInline && isProfileContext) {
      profileStatusInline.textContent = message;
      profileStatusInline.className = "auth-status auth-status-inline";
      if (type) profileStatusInline.classList.add(type);
    } else if (profileStatusInline && !isProfileContext) {
      profileStatusInline.textContent = "";
      profileStatusInline.className = "auth-status auth-status-inline";
    }
    if (mobileSettingsStatus) {
      mobileSettingsStatus.textContent = message;
      mobileSettingsStatus.className = "auth-status mobile-settings-status";
      if (type) mobileSettingsStatus.classList.add(type);
    }
  }

  function setAvatarStatus(message = "", type = "") {
    if (!profileAvatarStatus) return;
    profileAvatarStatus.textContent = message;
    profileAvatarStatus.className = "auth-status auth-status-inline";
    if (type) profileAvatarStatus.classList.add(type);
  }

  function escapeHtml(text) {
    return String(text || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function isSupabaseLockError(error) {
    const message = String(error?.message || "").toLowerCase();
    return message.includes("lock") || message.includes("stole it");
  }

  async function wait(ms) {
    await new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function withTimeout(promise, ms, label) {
    let timeoutId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error(`${label} hat zu lange gedauert (${ms}ms)`));
      }, ms);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }

  function getSupabaseRestBase() {
    const base = String(window.MINI_CHATROULETTE_SUPABASE_URL || "").replace(/\/+$/, "");
    return `${base}/rest/v1`;
  }

  function getSupabaseAuthHeaders() {
    const token = currentSession?.access_token;
    return {
      apikey: window.MINI_CHATROULETTE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    };
  }

  async function saveProfileViaServer(payload) {
    const response = await fetch("/api/profile/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-supabase-access-token": currentSession?.access_token || ""
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) {
      throw new Error(result?.error || `Serverfehler ${response.status}`);
    }
    return result.profile || null;
  }

  async function updateProfileViaRest(id, payload) {
    const response = await fetch(`${getSupabaseRestBase()}/profiles?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: getSupabaseAuthHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`REST ${response.status}: ${errorText || response.statusText}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? (data[0] || null) : data;
  }

  async function insertProfileViaRest(payload) {
    const response = await fetch(`${getSupabaseRestBase()}/profiles`, {
      method: "POST",
      headers: getSupabaseAuthHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`REST ${response.status}: ${errorText || response.statusText}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? (data[0] || null) : data;
  }

  function updateAvatarPreview(url) {
    if (!profileAvatarPreview) return;

    const safeUrl = String(url || "").trim();
    if (!safeUrl) {
      profileAvatarPreview.style.backgroundImage = "";
      profileAvatarPreview.textContent = "+";
      profileAvatarPreview.classList.remove("has-image");
      return;
    }

    profileAvatarPreview.style.backgroundImage = `url("${safeUrl.replaceAll('"', '\\"')}")`;
    profileAvatarPreview.textContent = "";
    profileAvatarPreview.classList.add("has-image");
  }

  function switchTab(tab) {
    if (tab === "profile" && !currentSession?.user) {
      tab = "login";
    }

    activeTab = tab;
    authPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.authPanel === tab));
    setStatus("");
    setAvatarStatus("");
  }

  function hideModal() {
    if (!authModal) return;
    authModal.hidden = true;
    body.classList.remove("auth-open");
  }

  function openModal(tab = activeTab) {
    if (!authModal) return;
    hideModal();
    authModal.hidden = false;
    body.classList.add("auth-open");
    if (!authHistoryOpen) {
      window.history.pushState({ miniChatrouletteModal: true }, "");
      authHistoryOpen = true;
    }
    switchTab(tab);
  }

  function closeModal() {
    if (!authModal || authModal.hidden) return;
    hideModal();
    if (authHistoryOpen) {
      authHistoryOpen = false;
      if (window.history.state?.miniChatrouletteModal) {
        window.history.back();
      }
    }
  }

  function updateAuthButtons() {
    const loggedIn = Boolean(currentSession?.user);
    const label = "Anmelden";

    if (authToggleDesktop) authToggleDesktop.textContent = label;
    if (authToggleMobile) authToggleMobile.classList.toggle("logged-in", loggedIn);
    body.classList.toggle("auth-logged-in", loggedIn);

    if (!loggedIn && activeTab === "profile") {
      activeTab = "login";
    }
  }

  function updateProfileSummary() {
    if (!currentSession?.user) {
      if (authProfileSummary) {
        authProfileSummary.innerHTML = "<strong>Nicht eingeloggt</strong><span>Melde dich an, um dein Konto und dein Profil zu speichern.</span>";
      }
      if (mobileAuthProfileSummary) {
        mobileAuthProfileSummary.innerHTML = "<strong>Nicht eingeloggt</strong><span>Melde dich an, um dein Konto und dein Profil zu speichern.</span>";
      }
      return;
    }

    const email = currentSession.user.email || "ohne E-Mail";
    const rawName = currentProfile?.display_name || currentProfile?.username || "";
    const normalizedName = rawName.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();
    const name = rawName && normalizedName !== normalizedEmail ? rawName : "Dein Konto";
    if (authProfileSummary) {
      authProfileSummary.innerHTML = `<strong>${escapeHtml(name)}</strong><span>${escapeHtml(email)}</span>`;
    }
    if (mobileAuthProfileSummary) {
      mobileAuthProfileSummary.innerHTML = `<strong>${escapeHtml(name)}</strong><span>${escapeHtml(email)}</span>`;
    }
    if (mobileSettingsGuestCard) mobileSettingsGuestCard.hidden = true;
    if (mobileSettingsAccountCard) mobileSettingsAccountCard.hidden = false;
  }

  function getProfileDebugLabel() {
    if (!currentProfile) return "Kein Profil geladen";
    return `Username: ${currentProfile.username || "-"} | Anzeigename: ${currentProfile.display_name || "-"} | Telefon: ${currentProfile.phone_number || "-"} | Alter: ${currentProfile.age || "-"} | Stadt: ${currentProfile.city || "-"} | Land: ${currentProfile.country || "-"}`;
  }

  function fillProfileFields() {
    if (!currentProfile) return;

    if (profileUsername) profileUsername.value = currentProfile.username || "";
    if (profileDisplayName) profileDisplayName.value = currentProfile.display_name || "";
    if (profilePhoneNumber) profilePhoneNumber.value = currentProfile.phone_number || "";
    if (profileAge) profileAge.value = currentProfile.age || "";
    if (profileCity) profileCity.value = currentProfile.city || "";
    if (profileCountry) profileCountry.value = currentProfile.country || "";
    if (profileBio) profileBio.value = currentProfile.bio || "";
    if (mobileProfileUsername) mobileProfileUsername.value = currentProfile.username || "";
    if (mobileProfileDisplayName) mobileProfileDisplayName.value = currentProfile.display_name || "";
    if (mobileProfilePhoneNumber) mobileProfilePhoneNumber.value = currentProfile.phone_number || "";

    if (genderInput && currentProfile.gender && genderInput.value !== currentProfile.gender) {
      genderInput.value = currentProfile.gender;
    }

    if (searchInput && currentProfile.seeking_gender && currentProfile.seeking_gender !== "everyone") {
      if (searchInput.value !== currentProfile.seeking_gender) {
        searchInput.value = currentProfile.seeking_gender;
      }
    }

    if (locationInput && currentProfile.location_label) {
      locationInput.value = currentProfile.location_label;
    }

    updateAvatarPreview(currentProfile.avatar_url || pendingAvatarUrl || "");
  }

  function buildProfilePayload(extra = {}) {
    const activeUsername = activeTab === "profile"
      ? profileUsername?.value?.trim()
      : mobileProfileUsername?.value?.trim();

    const activeDisplayName = activeTab === "profile"
      ? profileDisplayName?.value?.trim()
      : mobileProfileDisplayName?.value?.trim();

    const activePhoneNumber = activeTab === "profile"
      ? profilePhoneNumber?.value?.trim()
      : mobileProfilePhoneNumber?.value?.trim();

    const activeAgeRaw = profileAge?.value?.trim();
    const activeCity = profileCity?.value?.trim();
    const activeCountry = profileCountry?.value?.trim();
    const activeBio = profileBio?.value?.trim();

    const fallbackUsername =
      currentProfile?.username ||
      currentSession?.user?.user_metadata?.username ||
      currentSession?.user?.email?.split("@")[0] ||
      null;

    const fallbackDisplayName =
      currentProfile?.display_name ||
      currentSession?.user?.user_metadata?.display_name ||
      fallbackUsername;

    return {
      id: currentSession.user.id,
      username: activeUsername || fallbackUsername,
      display_name: activeDisplayName || fallbackDisplayName,
      phone_number: activePhoneNumber || currentProfile?.phone_number || null,
      avatar_url: pendingAvatarUrl || currentProfile?.avatar_url || null,
      age: activeAgeRaw ? Number(activeAgeRaw) : (currentProfile?.age ?? null),
      city: activeCity || currentProfile?.city || null,
      country: activeCountry || currentProfile?.country || null,
      bio: activeBio || currentProfile?.bio || null,
      gender: genderInput?.value || currentProfile?.gender || "unknown",
      seeking_gender: searchInput?.value || currentProfile?.seeking_gender || "unknown",
      location_label: locationInput?.value?.trim() || currentProfile?.location_label || null,
      ...extra
    };
  }

  async function ensureProfile() {
    if (!currentSession?.user) return;

    const userId = currentSession.user.id;
    const { data: existingProfile, error: selectError } = await client
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (selectError) throw selectError;
    if (existingProfile?.id) return;

    const fallbackUsername =
      currentSession?.user?.user_metadata?.username ||
      currentSession?.user?.email?.split("@")[0] ||
      `user${Date.now().toString().slice(-6)}`;

    const fallbackDisplayName =
      currentSession?.user?.user_metadata?.display_name ||
      fallbackUsername;

    const payload = {
      id: userId,
      username: fallbackUsername,
      display_name: fallbackDisplayName
    };

    const { error: insertError } = await client.from("profiles").insert(payload);
    if (insertError) throw insertError;
  }

  async function loadInbox() {
    if (!currentSession?.user) {
      if (authInboxList) {
        authInboxList.innerHTML = '<div class="auth-empty">Melde dich an, um Nachrichten zu sehen.</div>';
      }
      return;
    }

    const { data, error } = await client
      .from("admin_messages")
      .select("id,message,created_at,is_read")
      .eq("recipient_id", currentSession.user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      if (authInboxList) {
        authInboxList.innerHTML = '<div class="auth-empty">Nachrichten konnten gerade nicht geladen werden.</div>';
      }
      return;
    }

    if (!data?.length) {
      if (authInboxList) {
        authInboxList.innerHTML = '<div class="auth-empty">Noch keine Nachrichten.</div>';
      }
      return;
    }

    const inboxHtml = data.map((item) => `
      <article class="auth-message ${item.is_read ? "read" : "unread"}">
        <div class="auth-message-text">${escapeHtml(item.message)}</div>
        <div class="auth-message-date">${new Date(item.created_at).toLocaleString("de-DE")}</div>
      </article>
    `).join("");

    if (authInboxList) authInboxList.innerHTML = inboxHtml;

    await client
      .from("admin_messages")
      .update({ is_read: true })
      .eq("recipient_id", currentSession.user.id)
      .eq("is_read", false);
  }

  async function loadProfile() {
    if (!currentSession?.user) {
      currentProfile = null;
      updateAuthButtons();
      updateProfileSummary();
      await loadInbox();
      return;
    }

    const { data, error } = await client
      .from("profiles")
      .select("*")
      .eq("id", currentSession.user.id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        try {
          await ensureProfile();
          return await loadProfile();
        } catch {
          setStatus("Profil konnte gerade nicht geladen werden.", "error");
          return;
        }
      }

      setStatus("Profil konnte gerade nicht geladen werden.", "error");
      return;
    }

    currentProfile = data;
    fillProfileFields();
    updateAuthButtons();
    updateProfileSummary();
    await loadInbox();
  }

  async function saveProfileLegacy(extra = {}, options = {}) {
    if (!currentSession?.user) {
      setStatus("Bitte melde dich zuerst an.", "error");
      return;
    }

    const manual = Boolean(options.manual);

    if (manual && profileSaveTimer) {
      clearTimeout(profileSaveTimer);
      profileSaveTimer = null;
    }

    if (profileSaveInFlight) {
      if (manual) {
        setStatus("Profil wird gerade gespeichert. Bitte kurz warten.", "error");
      }
      return profileSaveInFlight;
    }

    const run = async () => {
    const payload = buildProfilePayload(extra);
    const { error } = await client.from("profiles").upsert(payload);

    if (error) {
      const message = String(error.message || "").toLowerCase();
      if (message.includes("duplicate key") || message.includes("profiles_username_key") || message.includes("username")) {
        setStatus("Der Benutzername ist schon vergeben. Bitte nimm einen anderen.", "error");
        return;
      }
      setStatus(error.message || "Profil konnte nicht gespeichert werden.", "error");
      return;
    }

    const { error: updateError } = await client.auth.updateUser({
      data: {
        username: payload.username,
        display_name: payload.display_name,
        avatar_url: payload.avatar_url
      }
    });

    pendingAvatarUrl = null;

    if (updateError) {
      const authLockMessage = String(updateError.message || "").toLowerCase();
      if (authLockMessage.includes("lock") || authLockMessage.includes("stole it")) {
        setStatus("Profil gespeichert. Schließe andere offene App-Tabs, damit die Anmeldung nicht konkurriert.", "success");
        await loadProfile();
        return;
      }

      setStatus(`Profil gespeichert, aber Auth-Metadaten nicht: ${updateError.message}`, "error");
      await loadProfile();
      return;
    }

    setStatus("Profil gespeichert.", "success");
    await loadProfile();
    };

    profileSaveInFlight = run().finally(() => {
      profileSaveInFlight = null;
    });

    return profileSaveInFlight;
  }

  function queueProfileSave() {
    return;
  }

  async function saveProfile(extra = {}, options = {}) {
    if (!currentSession?.user) {
      setStatus("Bitte melde dich zuerst an.", "error");
      return;
    }

    if (profileSaveInFlight) {
      setStatus("Ein Speicherversuch läuft noch. Bitte gleich nochmal tippen.", "error");
      return;
    }

    profileSaveInFlight = true;
    setStatus("Profil wird gespeichert... Klick erkannt.");

    try {
      const payload = buildProfilePayload(extra);
      const hasAvatarInPayload = Boolean(payload.avatar_url);

      let profileError = null;
      let savedProfile = null;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          setStatus(`Profil wird gespeichert... Server ${attempt + 1}/2 läuft. Bild im Request: ${hasAvatarInPayload ? "ja" : "nein"}`);
          savedProfile = await withTimeout(
            saveProfileViaServer(payload),
            12000,
            "Profil-Server"
          );
          profileError = null;
        } catch (error) {
          profileError = error;
        }

        if (!profileError) break;
        if (!isSupabaseLockError(profileError) || attempt === 1) break;
        await wait(250 * (attempt + 1));
      }

      if (profileError) {
        const message = String(profileError.message || "").toLowerCase();
        if (message.includes("duplicate key") || message.includes("profiles_username_key") || message.includes("username")) {
          setStatus("Der Benutzername ist schon vergeben. Bitte nimm einen anderen.", "error");
          return;
        }
        if (isSupabaseLockError(profileError)) {
          setStatus(`Speichern ist gerade blockiert. Grund: ${profileError.message || "Unbekannter Lock-Fehler"}`, "error");
          return;
        }
        const detail = profileError.code ? `${profileError.code}: ${profileError.message}` : (profileError.message || "Profil konnte nicht gespeichert werden.");
        setStatus(detail, "error");
        return;
      }

      setStatus("Profil gespeichert... UI wird aktualisiert.");
      pendingAvatarUrl = null;
      if (savedProfile) {
        currentProfile = savedProfile;
        fillProfileFields();
        updateProfileSummary();
      } else {
        await loadProfile();
      }
      setStatus(`Profil gespeichert. ${getProfileDebugLabel()} | avatar_url: ${savedProfile?.avatar_url ? "gesetzt" : "leer"}`, "success");
    } finally {
      profileSaveInFlight = false;
    }
  }

  async function handleAvatarSelection(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setAvatarStatus("Bitte wähle ein Bild aus.", "error");
      return;
    }

    if (file.size > 1024 * 1024 * 10) {
      setAvatarStatus("Das Bild ist zu groß. Bitte nimm maximal 10 MB.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result.startsWith("data:image/")) {
        setAvatarStatus("Profilbild konnte nicht gelesen werden.", "error");
        return;
      }

      pendingAvatarUrl = reader.result;
      updateAvatarPreview(pendingAvatarUrl || "");
      setAvatarStatus("Profilbild ausgewählt. Jetzt Profil speichern.", "success");
    };
    reader.onerror = () => {
      const type = String(file.type || "").toLowerCase();
      if (type.includes("heic") || type.includes("heif")) {
        setAvatarStatus("HEIC-Bilder werden hier nicht sauber unterstützt. Bitte nimm JPG oder PNG.", "error");
        return;
      };
      setAvatarStatus("Profilbild konnte nicht gelesen werden.", "error");
    };
    reader.readAsDataURL(file);
  }

  function clearSupabaseSessionStorage() {
    const stores = [window.localStorage, window.sessionStorage];

    stores.forEach((store) => {
      if (!store) return;
      const keysToRemove = [];

      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (!key) continue;
        if (key.startsWith("sb-") || key.includes("supabase")) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach((key) => store.removeItem(key));
    });
  }

  async function handleLogin() {
    const email = loginEmail?.value?.trim();
    const password = loginPassword?.value || "";

    if (!email || !password) {
      setStatus("Bitte E-Mail-Adresse und Passwort eingeben.", "error");
      return;
    }

    setStatus("Anmeldung läuft...");
    const { data, error } = await client.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus(error.message || "Login fehlgeschlagen.", "error");
      return;
    }

    currentSession = data.session;
    setStatus("Erfolgreich angemeldet.", "success");
    await ensureProfile();
    await loadProfile();
    closeModal();
  }

  async function handleForgotPassword() {
    const email = forgotEmail?.value?.trim() || loginEmail?.value?.trim();

    if (!email) {
      setStatus("Bitte gib deine E-Mail-Adresse ein.", "error");
      return;
    }

    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    setStatus("Link wird gesendet...");

    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });

    if (error) {
      setStatus(error.message || "Reset-Link konnte nicht gesendet werden.", "error");
      return;
    }

    if (forgotEmail) forgotEmail.value = email;
    setStatus("Wenn die E-Mail existiert, wurde ein Link zum Zurücksetzen gesendet.", "success");
  }

  async function handleRegister() {
    const email = registerEmail?.value?.trim();
    const password = registerPassword?.value || "";
    const passwordRepeat = registerPasswordRepeat?.value || "";

    if (!email || !password || !passwordRepeat) {
      setStatus("Bitte E-Mail-Adresse und beide Passwort-Felder ausfüllen.", "error");
      return;
    }

    if (password !== passwordRepeat) {
      setStatus("Die Passwörter stimmen nicht überein.", "error");
      return;
    }

    if (password.length < 6) {
      setStatus("Das Passwort muss mindestens 6 Zeichen haben.", "error");
      return;
    }

    const usernameBase = email.split("@")[0]?.trim() || "user";
    const username = (
      usernameBase
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "")
        .replace(/^[._-]+|[._-]+$/g, "")
        .slice(0, 24)
    ) || `user${Date.now().toString().slice(-6)}`;

    setStatus("Registrierung läuft...");
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          display_name: username
        }
      }
    });

    if (error) {
      setStatus(error.message || "Registrierung fehlgeschlagen.", "error");
      return;
    }

    if (!data.session) {
      setStatus("Konto erstellt. Bitte bestätige deine E-Mail, falls Supabase das verlangt.", "success");
      switchTab("login");
      return;
    }

    currentSession = data.session;
    setStatus("Konto erstellt und eingeloggt.", "success");
    await ensureProfile();
    await loadProfile();
    closeModal();
  }

  async function handleResetPassword() {
    const password = resetPassword?.value || "";
    const passwordRepeat = resetPasswordRepeat?.value || "";

    if (!password || !passwordRepeat) {
      setStatus("Bitte beide Passwort-Felder ausfüllen.", "error");
      return;
    }

    if (password !== passwordRepeat) {
      setStatus("Die Passwörter stimmen nicht überein.", "error");
      return;
    }

    if (password.length < 6) {
      setStatus("Das Passwort muss mindestens 6 Zeichen haben.", "error");
      return;
    }

    setStatus("Passwort wird gespeichert...");
    const { error } = await client.auth.updateUser({ password });

    if (error) {
      setStatus(error.message || "Passwort konnte nicht aktualisiert werden.", "error");
      return;
    }

    if (resetPassword) resetPassword.value = "";
    if (resetPasswordRepeat) resetPasswordRepeat.value = "";

    setStatus("Passwort erfolgreich geändert. Du kannst dich jetzt anmelden.", "success");
    switchTab("login");
  }

  async function handleLogout() {
    const { error } = await client.auth.signOut({ scope: "local" });

    if (error) {
      setStatus(error.message || "Logout fehlgeschlagen. Lokale Sitzung wird trotzdem beendet.", "error");
    }

    clearSupabaseSessionStorage();

    currentSession = null;
    currentProfile = null;
    if (mobileSettingsGuestCard) mobileSettingsGuestCard.hidden = false;
    if (mobileSettingsAccountCard) mobileSettingsAccountCard.hidden = true;
    updateAuthButtons();
    updateProfileSummary();
    await loadInbox();
    setStatus("Ausgeloggt.", "success");
    switchTab("login");
    closeModal();
    window.setTimeout(() => {
      window.location.reload();
    }, 120);
  }

  window.miniChatrouletteLogout = () => {
    void handleLogout();
  };
  window.miniChatrouletteSaveProfile = () => {
    void saveProfile({}, { manual: true });
  };

  async function handleResetPasswordFixed() {
    if (passwordChangeInFlight) {
      setStatus("Passwortänderung läuft bereits. Bitte kurz warten.", "error");
      return;
    }

    const password = resetPassword?.value || "";
    const passwordRepeat = resetPasswordRepeat?.value || "";

    if (!password || !passwordRepeat) {
      setStatus("Bitte beide Passwort-Felder ausfüllen.", "error");
      return;
    }

    if (password !== passwordRepeat) {
      setStatus("Die Passwörter stimmen nicht überein.", "error");
      return;
    }

    if (password.length < 6) {
      setStatus("Das Passwort muss mindestens 6 Zeichen haben.", "error");
      return;
    }

    passwordChangeInFlight = true;

    try {
      setStatus("Passwort wird gespeichert...");

      const result = await Promise.race([
        client.auth.updateUser({ password }),
        new Promise((resolve) =>
          window.setTimeout(
            () => resolve({ error: { message: "Die Passwortänderung hat zu lange gedauert. Bitte versuche es erneut oder nutze Passwort vergessen." } }),
            15000
          )
        )
      ]);

      const error = result?.error || null;

      if (error) {
        setStatus(error.message || "Passwort konnte nicht aktualisiert werden.", "error");
        return;
      }

      if (resetPassword) resetPassword.value = "";
      if (resetPasswordRepeat) resetPasswordRepeat.value = "";

      setStatus("Passwort erfolgreich geändert.", "success");
      switchTab(resetReturnTab === "profile" && currentSession?.user ? "profile" : "login");
    } finally {
      passwordChangeInFlight = false;
    }
  }

  async function initAuth() {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const recoveryType = hashParams.get("type");

    const { data } = await client.auth.getSession();
    currentSession = data.session;
    updateAuthButtons();
    updateProfileSummary();

    if (currentSession?.user) {
      try {
        await ensureProfile();
      } catch (_) {}
    }

    await loadProfile();

    if (recoveryType === "recovery") {
      openModal("reset");
      setStatus("Bitte gib jetzt dein neues Passwort ein.");
    }
  }

  authSwitchButtons.forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.authSwitch));
  });

  authToggleDesktop?.addEventListener("click", async () => {
    if (currentSession?.user) {
      openModal("profile");
      await loadProfile();
      return;
    }
    openModal("login");
  });
  authToggleMobile?.addEventListener("click", async () => {
    if (currentSession?.user) {
      openModal("profile");
      await loadProfile();
      return;
    }
    openModal("login");
  });
  authClose?.addEventListener("click", closeModal);
  authModal?.querySelector(".auth-backdrop")?.addEventListener("click", closeModal);
  window.addEventListener("popstate", () => {
    if (authModal && !authModal.hidden) {
      authHistoryOpen = false;
      hideModal();
    }
  });
  window.addEventListener("mini-chatroulette:open-account", async () => {
    if (currentSession?.user) {
      openModal("profile");
      await loadProfile();
      return;
    }
    openModal("login");
  });

  loginSubmit?.addEventListener("click", handleLogin);
  forgotSubmit?.addEventListener("click", handleForgotPassword);
  registerSubmit?.addEventListener("click", handleRegister);
  resetSubmit?.addEventListener("click", handleResetPasswordFixed);
  logoutSubmit?.addEventListener("click", handleLogout);
  profileSave?.addEventListener("click", () => saveProfile({}, { manual: true }));
  profileAvatarPick?.addEventListener("click", () => profileAvatarInput?.click());
  profileAvatarInput?.addEventListener("change", handleAvatarSelection);
  profileChangePassword?.addEventListener("click", () => {
    resetReturnTab = "profile";
    switchTab("reset");
    setStatus("Gib dein neues Passwort ein.", "success");
  });
  mobileSettingsAccountBtn?.addEventListener("click", async () => {
    if (currentSession?.user) {
      openModal("profile");
      await loadProfile();
      return;
    }
    openModal("login");
  });
  mobileSettingsItems.forEach((button) => {
    button.addEventListener("click", () => {
      setStatus("Dieser Bereich kommt als nächster Schritt.", "success");
    });
  });
  mobileSettingsLogoutBtn?.addEventListener("click", handleLogout);
  mobileProfileSave?.addEventListener("click", () => saveProfile({}, { manual: true }));
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest("#mobileSettingsLogoutBtn")) {
      handleLogout();
    }
  });

  client.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
    updateAuthButtons();
    updateProfileSummary();

    if (_event === "PASSWORD_RECOVERY") {
      openModal("reset");
      setStatus("Bitte gib jetzt dein neues Passwort ein.");
    }

    window.setTimeout(() => {
      void loadProfile();
    }, 0);
  });

  initAuth();
})();

