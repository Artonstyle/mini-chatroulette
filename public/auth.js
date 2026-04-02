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
  const authTabs = Array.from(document.querySelectorAll(".auth-tab"));
  const authPanels = Array.from(document.querySelectorAll("[data-auth-panel]"));

  const loginEmail = document.getElementById("loginEmail");
  const loginPassword = document.getElementById("loginPassword");
  const loginSubmit = document.getElementById("loginSubmit");

  const registerUsername = document.getElementById("registerUsername");
  const registerDisplayName = document.getElementById("registerDisplayName");
  const registerEmail = document.getElementById("registerEmail");
  const registerPassword = document.getElementById("registerPassword");
  const registerSubmit = document.getElementById("registerSubmit");

  const profileUsername = document.getElementById("profileUsername");
  const profileDisplayName = document.getElementById("profileDisplayName");
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

  function switchTab(tab) {
    activeTab = tab;
    authTabs.forEach((button) => button.classList.toggle("active", button.dataset.authTab === tab));
    authPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.authPanel === tab));
  }

  function updateAuthButtons() {
    const loggedIn = Boolean(currentSession?.user);
    const label = loggedIn ? (currentProfile?.display_name || currentProfile?.username || "Profil") : "Anmelden";

    if (authToggleDesktop) authToggleDesktop.textContent = label;
    if (authToggleMobile) authToggleMobile.classList.toggle("logged-in", loggedIn);
    body.classList.toggle("auth-logged-in", loggedIn);
  }

  function fillProfileFields() {
    if (!currentProfile) return;
    if (profileUsername) profileUsername.value = currentProfile.username || "";
    if (profileDisplayName) profileDisplayName.value = currentProfile.display_name || "";

    if (genderInput && currentProfile.gender && genderInput.value !== currentProfile.gender) {
      genderInput.value = currentProfile.gender;
    }

    if (searchInput) {
      const nextSearch = currentProfile.seeking_gender === "everyone" ? searchInput.value : currentProfile.seeking_gender;
      if (nextSearch && searchInput.value !== nextSearch) {
        searchInput.value = nextSearch;
      }
    }

    if (locationInput && currentProfile.location_label && !locationInput.value.trim()) {
      locationInput.value = currentProfile.location_label;
    }
  }

  function updateProfileSummary() {
    if (!authProfileSummary) return;

    if (!currentSession?.user) {
      authProfileSummary.innerHTML = "<strong>Nicht eingeloggt</strong><span>Melde dich freiwillig an, um dein Profil zu speichern.</span>";
      if (authAdminLink) authAdminLink.hidden = true;
      return;
    }

    const email = currentSession.user.email || "ohne E-Mail";
    const name = currentProfile?.display_name || currentProfile?.username || email;
    authProfileSummary.innerHTML = `<strong>${name}</strong><span>${email}</span>`;

    if (authAdminLink) {
      authAdminLink.hidden = !currentProfile?.is_admin;
    }
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

    const payload = {
      id: currentSession.user.id,
      username: profileUsername?.value?.trim() || currentProfile?.username || null,
      display_name: profileDisplayName?.value?.trim() || currentProfile?.display_name || null,
      gender: genderInput?.value || currentProfile?.gender || "unknown",
      seeking_gender: searchInput?.value || currentProfile?.seeking_gender || "unknown",
      location_label: locationInput?.value?.trim() || currentProfile?.location_label || null,
      ...extra
    };

    const { error } = await client.from("profiles").upsert(payload);
    if (error) {
      setStatus("Profil konnte nicht gespeichert werden.", "error");
      return;
    }

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

  function escapeHtml(text) {
    return String(text || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  async function handleLogin() {
    const email = loginEmail?.value?.trim();
    const password = loginPassword?.value || "";

    if (!email || !password) {
      setStatus("Bitte E-Mail und Passwort eingeben.", "error");
      return;
    }

    setStatus("Login läuft...");
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      setStatus(error.message || "Login fehlgeschlagen.", "error");
      return;
    }

    currentSession = data.session;
    setStatus("Eingeloggt.", "success");
    switchTab("profile");
    await loadProfile();
  }

  async function handleRegister() {
    const username = registerUsername?.value?.trim();
    const displayName = registerDisplayName?.value?.trim();
    const email = registerEmail?.value?.trim();
    const password = registerPassword?.value || "";

    if (!username || !email || !password) {
      setStatus("Bitte Benutzername, E-Mail und Passwort ausfüllen.", "error");
      return;
    }

    setStatus("Registrierung läuft...");
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          display_name: displayName || username
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
    await loadProfile();
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
    const { data } = await client.auth.getSession();
    currentSession = data.session;
    updateAuthButtons();
    updateProfileSummary();
    await loadProfile();
  }

  authTabs.forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.authTab));
  });

  authToggleDesktop?.addEventListener("click", () => openModal(currentSession?.user ? "profile" : "login"));
  authToggleMobile?.addEventListener("click", () => openModal(currentSession?.user ? "profile" : "login"));
  authClose?.addEventListener("click", closeModal);
  authModal?.querySelector(".auth-backdrop")?.addEventListener("click", closeModal);

  loginSubmit?.addEventListener("click", handleLogin);
  registerSubmit?.addEventListener("click", handleRegister);
  logoutSubmit?.addEventListener("click", handleLogout);
  profileSave?.addEventListener("click", () => saveProfile());

  [genderInput, searchInput, locationInput].forEach((input) => {
    input?.addEventListener("change", queueProfileSave);
  });

  profileUsername?.addEventListener("input", queueProfileSave);
  profileDisplayName?.addEventListener("input", queueProfileSave);

  client.auth.onAuthStateChange(async (_event, session) => {
    currentSession = session;
    updateAuthButtons();
    updateProfileSummary();
    await loadProfile();
  });

  initAuth();
})();
