(function () {
  const supabaseGlobal = window.supabase;
  const supabaseUrl = window.MINI_CHATROULETTE_SUPABASE_URL;
  const supabaseAnonKey = window.MINI_CHATROULETTE_SUPABASE_ANON_KEY;

  if (!supabaseGlobal || !supabaseUrl || !supabaseAnonKey) return;

  const client = supabaseGlobal.createClient(supabaseUrl, supabaseAnonKey);

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
  const profileSave = document.getElementById("profileSave");
  const logoutSubmit = document.getElementById("logoutSubmit");
  const authProfileSummary = document.getElementById("authProfileSummary");
  const authInboxList = document.getElementById("authInboxList");
  const authAdminLink = document.getElementById("authAdminLink");

  const genderInput = document.getElementById("gender");
  const searchInput = document.getElementById("search");
  const locationInput = document.getElementById("locationText");

  let activeTab = "login";
  let currentSession = null;
  let currentProfile = null;
  let profileSaveTimer = null;

  function setStatus(message = "", type = "") {
    if (!authStatus) return;
    authStatus.textContent = message;
    authStatus.className = "auth-status";
    if (type) authStatus.classList.add(type);
  }

  function escapeHtml(text) {
    return String(text || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function switchTab(tab) {
    if (tab === "profile" && !currentSession?.user) {
      tab = "login";
    }

    activeTab = tab;
    authPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.authPanel === tab));
    setStatus("");
  }

  function openModal(tab = activeTab) {
    if (!authModal) return;
    authModal.hidden = false;
    body.classList.add("auth-open");
    switchTab(tab);
  }

  function closeModal() {
    if (!authModal) return;
    authModal.hidden = true;
    body.classList.remove("auth-open");
  }

  function updateAuthButtons() {
    const loggedIn = Boolean(currentSession?.user);
    const label = loggedIn
      ? (currentProfile?.display_name || currentProfile?.username || "Konto")
      : "Anmelden";

    if (authToggleDesktop) authToggleDesktop.textContent = label;
    if (authToggleMobile) authToggleMobile.classList.toggle("logged-in", loggedIn);
    body.classList.toggle("auth-logged-in", loggedIn);

    if (!loggedIn && activeTab === "profile") {
      activeTab = "login";
    }
  }

  function updateProfileSummary() {
    if (!authProfileSummary) return;

    if (!currentSession?.user) {
      authProfileSummary.innerHTML = "<strong>Nicht eingeloggt</strong><span>Melde dich an, um dein Konto und dein Profil zu speichern.</span>";
      if (authAdminLink) authAdminLink.hidden = true;
      return;
    }

    const email = currentSession.user.email || "ohne E-Mail";
    const name = currentProfile?.display_name || currentProfile?.username || email;
    authProfileSummary.innerHTML = `<strong>${escapeHtml(name)}</strong><span>${escapeHtml(email)}</span>`;

    if (authAdminLink) {
      authAdminLink.hidden = !currentProfile?.is_admin;
    }
  }

  function fillProfileFields() {
    if (!currentProfile) return;

    if (profileUsername) profileUsername.value = currentProfile.username || "";
    if (profileDisplayName) profileDisplayName.value = currentProfile.display_name || "";
    if (profilePhoneNumber) profilePhoneNumber.value = currentProfile.phone_number || "";

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
  }

  function buildProfilePayload(extra = {}) {
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
      username: profileUsername?.value?.trim() || fallbackUsername,
      display_name: profileDisplayName?.value?.trim() || fallbackDisplayName,
      phone_number: profilePhoneNumber?.value?.trim() || currentProfile?.phone_number || null,
      gender: genderInput?.value || currentProfile?.gender || "unknown",
      seeking_gender: searchInput?.value || currentProfile?.seeking_gender || "unknown",
      location_label: locationInput?.value?.trim() || currentProfile?.location_label || null,
      ...extra
    };
  }

  async function ensureProfile() {
    if (!currentSession?.user) return;

    const payload = buildProfilePayload();
    const { error } = await client.from("profiles").upsert(payload);
    if (error) throw error;
  }

  async function loadInbox() {
    if (!authInboxList) return;

    if (!currentSession?.user) {
      authInboxList.innerHTML = '<div class="auth-empty">Melde dich an, um Nachrichten zu sehen.</div>';
      return;
    }

    const { data, error } = await client
      .from("admin_messages")
      .select("id,message,created_at,is_read")
      .eq("recipient_id", currentSession.user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      authInboxList.innerHTML = '<div class="auth-empty">Nachrichten konnten gerade nicht geladen werden.</div>';
      return;
    }

    if (!data?.length) {
      authInboxList.innerHTML = '<div class="auth-empty">Noch keine Nachrichten.</div>';
      return;
    }

    authInboxList.innerHTML = data.map((item) => `
      <article class="auth-message ${item.is_read ? "read" : "unread"}">
        <div class="auth-message-text">${escapeHtml(item.message)}</div>
        <div class="auth-message-date">${new Date(item.created_at).toLocaleString("de-DE")}</div>
      </article>
    `).join("");

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

  async function saveProfile(extra = {}) {
    if (!currentSession?.user) return;

    const payload = buildProfilePayload(extra);
    const { error } = await client.from("profiles").upsert(payload);

    if (error) {
      setStatus("Profil konnte nicht gespeichert werden.", "error");
      return;
    }

    await client.auth.updateUser({
      data: {
        username: payload.username,
        display_name: payload.display_name
      }
    });

    setStatus("Profil gespeichert.", "success");
    await loadProfile();
  }

  function queueProfileSave() {
    if (!currentSession?.user) return;
    if (profileSaveTimer) clearTimeout(profileSaveTimer);

    profileSaveTimer = setTimeout(() => {
      saveProfile();
      profileSaveTimer = null;
    }, 600);
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
    switchTab("profile");
    await ensureProfile();
    await loadProfile();
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
    switchTab("profile");
    await ensureProfile();
    await loadProfile();
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
    await client.auth.signOut();
    currentSession = null;
    currentProfile = null;
    updateAuthButtons();
    updateProfileSummary();
    await loadInbox();
    setStatus("Ausgeloggt.", "success");
    switchTab("login");
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

  authToggleDesktop?.addEventListener("click", () => openModal(currentSession?.user ? "profile" : "login"));
  authToggleMobile?.addEventListener("click", () => openModal(currentSession?.user ? "profile" : "login"));
  authClose?.addEventListener("click", closeModal);
  authModal?.querySelector(".auth-backdrop")?.addEventListener("click", closeModal);

  loginSubmit?.addEventListener("click", handleLogin);
  forgotSubmit?.addEventListener("click", handleForgotPassword);
  registerSubmit?.addEventListener("click", handleRegister);
  resetSubmit?.addEventListener("click", handleResetPassword);
  logoutSubmit?.addEventListener("click", handleLogout);
  profileSave?.addEventListener("click", () => saveProfile());

  [genderInput, searchInput, locationInput].forEach((input) => {
    input?.addEventListener("change", queueProfileSave);
  });

  profileUsername?.addEventListener("input", queueProfileSave);
  profileDisplayName?.addEventListener("input", queueProfileSave);
  profilePhoneNumber?.addEventListener("input", queueProfileSave);

  client.auth.onAuthStateChange(async (_event, session) => {
    currentSession = session;
    updateAuthButtons();
    updateProfileSummary();

    if (_event === "PASSWORD_RECOVERY") {
      openModal("reset");
      setStatus("Bitte gib jetzt dein neues Passwort ein.");
    }

    await loadProfile();
  });

  initAuth();
})();
