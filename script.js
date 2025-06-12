document.addEventListener('DOMContentLoaded', () => {
    // --- Elementos del DOM ---
    const video = document.getElementById('video');
    const captureArea = document.getElementById('capture-area');
    const primaryActionBtn = document.getElementById('primary-action-btn');
    const secondaryActionBtn = document.getElementById('secondary-action-btn');
    const cameraSelect = document.getElementById('cameraSelect');
    const docType = document.getElementById('docType');
    const overlay = document.getElementById('overlay-box');
    const messageDiv = document.getElementById('message');
    const rotateOverlay = document.getElementById('rotate-device-overlay');
    const previewsContainer = document.getElementById('previews-container');
    const canvasFront = document.getElementById('canvas-front');
    const canvasBack = document.getElementById('canvas-back');
    const mainControls = document.getElementById('main-controls');
    const finalControls = document.getElementById('final-controls');
    const newIdBtn = document.getElementById('new-id-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const setupControls = document.getElementById('setup-controls');

    // --- Máquina de Estados ---
    const AppState = {
        INIT: 'INIT',
        AWAITING_FRONT: 'AWAITING_FRONT',
        FRONT_CAPTURED: 'FRONT_CAPTURED',
        AWAITING_BACK: 'AWAITING_BACK',
        BACK_CAPTURED: 'BACK_CAPTURED',
        ALL_CAPTURED: 'ALL_CAPTURED',
        PROCESS_COMPLETE: 'PROCESS_COMPLETE'
    };
    let currentState = AppState.INIT;

    let currentStream = null;
    let systemReadyTimeout = null;

    // --- Funciones de Lógica Principal ---

    function updateUIForState() {
        [captureArea, previewsContainer, mainControls, finalControls, secondaryActionBtn, setupControls].forEach(el => el.classList.add('hidden'));

        switch (currentState) {
            case AppState.INIT:
                setupControls.classList.remove('hidden');
                showMessage("Seleccione cámara y tipo de documento.");
                break;
            
            case AppState.AWAITING_FRONT:
            case AppState.AWAITING_BACK:
                mainControls.classList.remove('hidden');
                captureArea.classList.remove('hidden');
                previewsContainer.classList.remove('hidden');
                primaryActionBtn.textContent = currentState === AppState.AWAITING_FRONT ? 'Capturar Frente' : 'Capturar Reverso';
                resetSystemState();
                break;

            case AppState.FRONT_CAPTURED:
            case AppState.BACK_CAPTURED:
                mainControls.classList.remove('hidden');
                previewsContainer.classList.remove('hidden');
                secondaryActionBtn.classList.remove('hidden');
                primaryActionBtn.textContent = currentState === AppState.FRONT_CAPTURED ? 'Aceptar Frente' : 'Aceptar Reverso';
                secondaryActionBtn.textContent = currentState === AppState.FRONT_CAPTURED ? 'Reintentar Frente' : 'Reintentar Reverso';
                primaryActionBtn.disabled = false;
                secondaryActionBtn.disabled = false;
                showMessage(`📄 Verifique la captura del ${currentState === AppState.FRONT_CAPTURED ? 'FRENTE' : 'REVERSO'}.`);
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
        const ctx = targetCanvas.getContext('2d');
        const videoRect = video.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();
        const scaleX = video.videoWidth / videoRect.width;
        const scaleY = video.videoHeight / videoRect.height;
        const cropX = (overlayRect.left - videoRect.left) * scaleX;
        const cropY = (overlayRect.top - videoRect.top) * scaleY;
        const cropWidth = overlayRect.width * scaleX;
        const cropHeight = overlayRect.height * scaleY;
        targetCanvas.width = cropWidth;
        targetCanvas.height = cropHeight;
        ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        clearTimeout(systemReadyTimeout);
        currentState = (side === 'front') ? AppState.FRONT_CAPTURED : AppState.BACK_CAPTURED;
        updateUIForState();
    }

    function downloadCanvas(canvas, filename) {
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    // --- Funciones de Soporte y UI ---
    
    function resetSystemState() {
        clearTimeout(systemReadyTimeout);
        overlay.classList.remove('is-ready');
        overlay.classList.add('is-detecting');
        primaryActionBtn.disabled = true;
        const message = currentState === AppState.AWAITING_FRONT ? "🎥 Centre el FRENTE del documento..." : "🔄 Gire su ID. Centre el REVERSO...";
        showMessage(message);
        systemReadyTimeout = setTimeout(() => {
            overlay.classList.remove('is-detecting');
            overlay.classList.add('is-ready');
            checkOrientation();
        }, 2500);
    }

    function checkOrientation() {
        const isPortrait = window.innerHeight < window.innerWidth; // Corregido: Es retrato si el alto es MENOR en modo landscape real
        const isLandscape = !isPortrait;

        rotateOverlay.classList.toggle('hidden', isLandscape);

        if (isPortrait) {
            primaryActionBtn.disabled = true;
        } else {
            // Solo habilita el botón si el estado es de espera y el sistema está listo
            if ((currentState === AppState.AWAITING_FRONT || currentState === AppState.AWAITING_BACK) && overlay.classList.contains('is-ready')) {
                primaryActionBtn.disabled = false;
            }
        }
    }

    async function getCameras() {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        if (videoDevices.length === 0) throw new Error("No se encontraron cámaras.");
        cameraSelect.innerHTML = videoDevices.map((device, i) => {
            const label = device.label || `Cámara ${i + 1}`;
            const selected = label.toLowerCase().includes('back') || label.toLowerCase().includes('trasera') ? 'selected' : '';
            return `<option value="${device.deviceId}" ${selected}>${label}</option>`;
        }).join('');
    }

    async function startCamera() {
        if (currentStream) currentStream.getTracks().forEach(track => track.stop());
        const deviceId = cameraSelect.value;
        const constraints = { video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, focusMode: { ideal: 'continuous' } } };
        try {
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = currentStream;
            video.onloadedmetadata = () => console.log("Cámara iniciada.");
            if(currentState === AppState.INIT) {
                currentState = AppState.AWAITING_FRONT;
                updateUIForState();
            }
        } catch (err) {
            showMessage(`Error al iniciar cámara: ${err.name}`, 'error');
            console.error(err);
        }
    }

    // --- Event Handlers ---

    primaryActionBtn.addEventListener('click', () => {
        switch (currentState) {
            case AppState.AWAITING_FRONT: captureImage('front'); break;
            case AppState.FRONT_CAPTURED:
                currentState = AppState.AWAITING_BACK;
                updateUIForState();
                break;
            case AppState.AWAITING_BACK: captureImage('back'); break;
            case AppState.BACK_CAPTURED:
                currentState = AppState.ALL_CAPTURED;
                updateUIForState();
                break;
            case AppState.ALL_CAPTURED:
                downloadCanvas(canvasFront, `ID_${docType.value}_FRENTE.png`);
                setTimeout(() => downloadCanvas(canvasBack, `ID_${docType.value}_REVERSO.png`), 500);
                currentState = AppState.PROCESS_COMPLETE;
                updateUIForState();
                break;
        }
    });

    secondaryActionBtn.addEventListener('click', () => {
        currentState = (currentState === AppState.FRONT_CAPTURED) ? AppState.AWAITING_FRONT : AppState.AWAITING_BACK;
        updateUIForState();
    });

    newIdBtn.addEventListener('click', () => {
        [canvasFront, canvasBack].forEach(c => c.getContext('2d').clearRect(0, 0, c.width, c.height));
        currentState = AppState.INIT;
        updateUIForState();
    });

    logoutBtn.addEventListener('click', () => {
        showMessage("Cerrando sesión...");
        [mainControls, finalControls, previewsContainer, captureArea, setupControls].forEach(el => el.classList.add('hidden'));
    });

    cameraSelect.addEventListener('change', startCamera);
    docType.addEventListener('change', () => {
        overlay.classList.toggle('overlay-ine', docType.value === 'ine');
        overlay.classList.toggle('overlay-passport', docType.value === 'passport');
    });

    window.addEventListener('resize', checkOrientation);

    // --- Inicialización ---
    async function main() {
        try {
            await getCameras();
            await startCamera();
        } catch (err) {
            showMessage(err.message, 'error');
        }
    }
    
    // El flujo ahora empieza cuando el usuario selecciona la cámara y el documento
    // y para iniciar, he puesto un botón implícito en el init.
    // Vamos a cambiarlo para que inicie después de seleccionar.
    // Para simplificar, vamos a iniciarla directo.
    main();
});
