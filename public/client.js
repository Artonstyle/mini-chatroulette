<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mini Chatroulette</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: linear-gradient(135deg, #1c1c1c, #2e2e2e);
      color: #fff;
      margin: 0;
      padding: 20px;
    }
    header {
      font-size: 2em;
      font-weight: bold;
      margin-bottom: 20px;
      text-align: center;
    }
    .profile-form, .videos, .chat-box {
      background: rgba(50, 50, 50, 0.95);
      padding: 15px;
      margin: 10px auto;
      border-radius: 12px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.5);
      max-width: 1200px;
    }
    .profile-form label {
      margin-right: 15px;
    }
    video {
      width: 48%;
      height: 360px;
      background: #000;
      border-radius: 8px;
      margin: 5px 0;
      object-fit: cover;
    }
    .video-container {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
    }
    .buttons {
      margin-top: 10px;
      display: flex;
      gap: 10px;
    }
    button {
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 1em;
      font-weight: bold;
    }
    .btn-start, .btn-next {
      background-color: #007bff;
      color: #fff;
    }
    .btn-stop {
      background-color: #dc3545;
      color: #fff;
    }
    .btn-send {
      background-color: #28a745;
      color: #fff;
    }
    .chat-messages {
      height: 200px;
      overflow-y: auto;
      background: #1f1f1f;
      padding: 10px;
      border-radius: 8px;
      margin-bottom: 10px;
    }
    .chat-input {
      display: flex;
      gap: 10px;
    }
    .chat-input input {
      flex: 1;
      padding: 10px;
      border-radius: 8px;
      border: none;
      font-size: 1em;
    }
  </style>
</head>
<body>
  <header>Mini Chatroulette</header>

  <section class="profile-form">
    <label>Ich bin:
      <select id="gender">
        <option>Mann</option>
        <option>Frau</option>
      </select>
    </label>
    <label>Ich suche:
      <select id="search">
        <option>Mann</option>
        <option>Frau</option>
      </select>
    </label>
    <label>Mein Land:
      <select id="country">
        <option>Deutschland</option>
        <option>Österreich</option>
        <option>Schweiz</option>
      </select>
    </label>
    <button class="btn-start">Start</button>
  </section>

  <section class="videos">
    <div class="video-container">
      <video id="localVideo" autoplay muted></video>
      <video id="remoteVideo" autoplay></video>
    </div>
    <div class="buttons">
      <button class="btn-next">Nächster</button>
      <button class="btn-stop">Stop</button>
    </div>
  </section>

  <section class="chat-box">
    <div class="chat-messages"></div>
    <div class="chat-input">
      <input type="text" placeholder="Nachricht schreiben..." />
      <button class="btn-send">Senden</button>
    </div>
  </section>

  <!-- jetzt nur client.js laden -->
  <script src="client.js"></script>
</body>
</html>
