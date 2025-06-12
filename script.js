document.addEventListener('DOMContentLoaded', () => {
    // --- Elementos del DOM ---
    const primaryActionBtn = document.getElementById('primary-action-btn');
    const secondaryActionBtn = document.getElementById('secondary-action-btn');
    const cameraSelect = document.getElementById('cameraSelect');
    const docType = document.getElementById('docType');
    const messageDiv = document.getElementById('message');
    const rotateOverlay = document.getElementById('rotate-device-overlay');
    const mainControls = document.getElementById('main-controls');
    const finalControls = document.getElementById('final-controls');
    const newIdBtn = document.getElementById('new-id-btn');
    const setupControls = document.getElementById('setup-controls');
    const captureUiWrapper = document.getElementById('capture-ui-wrapper');
    const previewsContainer = document.getElementById('previews-container');
    const canvasFront = document.getElementById('canvas-front');
    const canvasBack = document.getElementById('canvas-back');
    const video = document.getElementById('video');
    const overlay = document.getElementById('overlay-box');
    
    // --- Máquina de Estados ---
    const AppState = { /* ... (sin cambios) ... */ };
    let currentState = AppState.INIT;
    let currentStream = null;
    let systemReadyTimeout = null;

    // --- Funciones de Lógica Principal ---

    function updateUIForState() {
        [captureUiWrapper, previewsContainer, mainControls, finalControls, secondaryActionBtn, setupControls].forEach(el => el.classList.add('hidden'));
        showMessage("");

        switch (currentState) {
            case AppState.INIT:
                setupControls.classList.remove('hidden');
                mainControls.classList.remove('hidden');
                primaryActionBtn.textContent = 'Iniciar Captura';
                primaryActionBtn.disabled = false;
                showMessage("Seleccione el tipo de documento.");
                break;
            
            case AppState.AWAITING_FRONT:
            case AppState.AWAITING_BACK:
                mainControls.classList.remove('hidden');
                captureUiWrapper.classList.remove('hidden');
                if(canvasFront.width > 0) previewsContainer.classList.remove('hidden');
                primaryActionBtn.textContent = currentState === AppState.AWAITING_FRONT ? 'Capturar Frente' : 'Capturar Reverso';
                resetSystemState();
                break;

            case AppState.FRONT_CAPTURED:
            case AppState.BACK_CAPTURED:
                mainControls.classList.remove('hidden');
                previewsContainer.classList.remove('hidden');
                secondaryActionBtn.classList.remove('hidden');
                captureUiWrapper.classList.remove('hidden'); // Muestra video y controles de cámara
                primaryActionBtn.textContent = currentState === AppState.FRONT_CAPTURED ? 'Aceptar Frente' : 'Aceptar Reverso';
                secondaryActionBtn.textContent = currentState === AppState.FRONT_CAPTURED ? 'Reintentar Frente' : 'Reintentar Reverso';
                primaryActionBtn.disabled = false;
                secondaryActionBtn.disabled = false;
                showMessage(`Verifique la captura del ${currentState === AppState.FRONT_CAPTURED ? 'FRENTE' : 'REVERSO'}.`);
                video.classList.add('hidden'); // Oculta el video para ver la preview
                break;
                
            case AppState.ALL_CAPTURED:
                mainControls.classList.remove('hidden');
                previewsContainer.classList.remove('hidden');
                primaryActionBtn.textContent = 'Enviar a BDR';
                primaryActionBtn.disabled = false;
                showMessage("✅ Capturas completadas. Listo para enviar.");
                break;

            case AppState.PROCESS_COMPLETE:
                finalControls.classList.remove('hidden');
                previewsContainer.classList.remove('hidden');
                showMessage("🚀 Proceso finalizado con éxito.");
                break;
        }
    }

    function captureImage(side) {
        if (video.readyState < video.HAVE_METADATA) return;
        const targetCanvas = (side === 'front') ? canvasFront : canvasBack;
        // ... (lógica de dibujo en canvas sin cambios)
        clearTimeout(systemReadyTimeout);
        currentState = (side === 'front') ? AppState.FRONT_CAPTURED : AppState.BACK_CAPTURED;
        updateUIForState();
    }

    // --- Funciones de Soporte y UI ---
    
    function resetSystemState() {
        clearTimeout(systemReadyTimeout);
        video.classList.remove('hidden');
        overlay.classList.remove('is-ready');
        overlay.classList.add('is-detecting');
        primaryActionBtn.disabled = true;
        const message = currentState === AppState.AWAITING_FRONT ? "🎥 Centre el FRENTE..." : "🔄 Centre el REVERSO...";
        showMessage(message);
        systemReadyTimeout = setTimeout(() => {
            overlay.classList.remove('is-detecting');
            overlay.classList.add('is-ready');
            updateButtonState();
        }, 2500);
    }

    const isLandscape = () => window.innerWidth > window.innerHeight;

    function updateButtonState() {
        const isCaptureState = currentState === AppState.AWAITING_FRONT || currentState === AppState.AWAITING_BACK;
        if (isLandscape() && isCaptureState && overlay.classList.contains('is-ready')) {
            primaryActionBtn.disabled = false;
        } else if (isCaptureState) {
            primaryActionBtn.disabled = true;
        }
    }

    function checkOrientation() {
        rotateOverlay.classList.toggle('hidden', isLandscape());
        updateButtonState();
    }

    async function getCameras() {
        // ... (sin cambios)
    }

    async function startCamera() {
        if (currentStream) currentStream.getTracks().forEach(track => track.stop());
        try {
            const deviceId = cameraSelect.value;
            // ... (constraints sin cambios)
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = currentStream;
            await new Promise(resolve => video.onloadedmetadata = resolve);
            currentState = AppState.AWAITING_FRONT;
            updateUIForState();
        } catch (err) {
            // ... (manejo de error sin cambios)
        }
    }

    function showMessage(text) {
        messageDiv.textContent = text || "";
    }

    // --- Event Handlers ---

    primaryActionBtn.addEventListener('click', () => {
        switch (currentState) {
            case AppState.INIT: startCamera(); break;
            case AppState.AWAITING_FRONT: captureImage('front'); break;
            case AppState.FRONT_CAPTURED:
                currentState = AppState.AWAITING_BACK;
                updateUIForState();
                break;
            // ... (resto de los casos sin cambios)
        }
    });

    secondaryActionBtn.addEventListener('click', () => {
        currentState = (currentState === AppState.FRONT_CAPTURED) ? AppState.AWAITING_FRONT : AppState.AWAITING_BACK;
        updateUIForState();
    });

    newIdBtn.addEventListener('click', () => {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        [canvasFront, canvasBack].forEach(c => c.getContext('2d').clearRect(0, 0, c.width, c.height));
        currentState = AppState.INIT;
        updateUIForState();
    });

    cameraSelect.addEventListener('change', () => {
        // Si estamos en un estado de captura, reinicia la cámara con la nueva selección
        if(currentState === AppState.AWAITING_FRONT || currentState === AppState.AWAITING_BACK) {
            startCamera();
        }
    });

    // ... (resto de los listeners sin cambios)

    // --- Inicialización ---
    async function main() {
        try {
            await getCameras();
            updateUIForState();
        } catch (err) {
            showMessage(err.message);
        }
    }
    
    main();
});
