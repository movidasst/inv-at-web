// Esta es una aplicación de un solo archivo. Toda la lógica está contenida en esta etiqueta de script.
document.addEventListener('DOMContentLoaded', () => {
    
    // --- ESTADO DE LA APLICACIÓN ---
    let currentStep = 0;
    const totalSteps = 6;
    let investigationState = {};
    let connectingNode = null; // Se utiliza en el paso del diagrama
    
    const initialState = {
        general: { date: '', time: '', location: '', description: '' },
        persons: [{ name: '', role: '', consequence: '' }],
        investigator: { name: '', role: '', date: '' },
        information: '',
        facts: [],
        diagram: { nodes: [], connections: [] },
        measures: {},
        rootCauseSummary: '' // NUEVO: Para guardar el resumen de la IA
    };

    // --- ELEMENTOS DEL DOM ---
    const appContainer = document.getElementById('app-container');
    const tabs = document.querySelectorAll('.tab');
    const nextBtn = document.getElementById('next-btn');
    const prevBtn = document.getElementById('prev-btn');
    const newInvestigationBtn = document.getElementById('new-investigation-btn');
    const exportBtn = document.getElementById('export-btn');
    const importInput = document.getElementById('import-file');
    const confirmModal = document.getElementById('confirm-modal');
    const connectionTypeModal = document.getElementById('connection-type-modal');
    const loadingOverlay = document.getElementById('loading-overlay');
    const factSelectionModal = document.getElementById('fact-selection-modal');
    
    // --- GESTIÓN DE ESTADO Y ALMACENAMIENTO ---
    function saveState() {
        localStorage.setItem('mac-investigation', JSON.stringify(investigationState));
        updateStepCompletion();
    }

    function loadState() {
        const savedState = localStorage.getItem('mac-investigation');
        investigationState = savedState ? JSON.parse(savedState) : JSON.parse(JSON.stringify(initialState));
        if (!investigationState.investigator) {
            investigationState.investigator = { name: '', role: '', date: '' };
        }
        if (!investigationState.rootCauseSummary) {
            investigationState.rootCauseSummary = '';
        }
        // Retrocompatibilidad para la nueva propiedad isExternal
        if(investigationState.diagram.nodes) {
            investigationState.diagram.nodes.forEach(node => {
                if (node.isExternal === undefined) {
                    node.isExternal = false;
                }
            });
        }
        currentStep = 0;
        updateNav();
    }

    function resetState() {
        investigationState = JSON.parse(JSON.stringify(initialState));
        saveState();
        currentStep = 1;
        updateNav();
    }
    
    // --- MODALES ---
    function showConfirmation(title, message, onOk, options = {}) {
        const { okText = 'Confirmar', cancelText = 'Cancelar', showCancel = true, okClass = 'bg-red-500 text-white hover:bg-red-600' } = options;
        
        confirmModal.querySelector('#confirm-title').textContent = title;
        confirmModal.querySelector('#confirm-message').textContent = message;
        
        const okBtn = confirmModal.querySelector('#confirm-ok');
        const cancelBtn = confirmModal.querySelector('#confirm-cancel');

        okBtn.textContent = okText;
        cancelBtn.textContent = cancelText;

        okBtn.className = `px-4 py-2 rounded-lg font-semibold ${okClass}`;
        cancelBtn.style.display = showCancel ? 'inline-block' : 'none';
        
        confirmModal.style.display = "flex";
        
        const okHandler = () => { onOk(); close(); };
        const close = () => {
            confirmModal.style.display = "none";
            okBtn.removeEventListener('click', okHandler);
            cancelBtn.removeEventListener('click', close);
        };
        
        okBtn.addEventListener('click', okHandler);
        cancelBtn.addEventListener('click', close);
    }

    function showFactSelectionModal(suggestedFacts) {
        const listContainer = factSelectionModal.querySelector('#fact-selection-list');
        listContainer.innerHTML = suggestedFacts.map((fact, index) => `
            <label class="flex items-center p-2 bg-white rounded-md border cursor-pointer hover:bg-slate-100">
                <input type="checkbox" checked class="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500" data-fact="${fact}">
                <span class="ml-3 text-sm text-gray-700">${fact}</span>
            </label>
        `).join('');
        factSelectionModal.style.display = "flex";

        const cancelBtn = factSelectionModal.querySelector('#fact-selection-cancel');
        const addBtn = factSelectionModal.querySelector('#fact-selection-add');

        const close = () => factSelectionModal.style.display = "none";
        
        const addHandler = () => {
            const selectedFacts = Array.from(listContainer.querySelectorAll('input:checked')).map(input => input.dataset.fact);
            investigationState.facts.push(...selectedFacts);
            saveState();
            currentStep = 3;
            updateNav();
            close();
        };

        cancelBtn.addEventListener('click', close, { once: true });
        addBtn.addEventListener('click', addHandler, { once: true });
    }

    function showConnectionTypeModal(fromNode, toNode) {
        connectionTypeModal.querySelector('#connection-message').innerHTML = `Conectar <strong>"${fromNode.text}"</strong> como causa de <strong>"${toNode.text}"</strong>.`;
        connectionTypeModal.style.display = "flex";

        const chainBtn = connectionTypeModal.querySelector('#chain-btn');
        const conjunctionBtn = connectionTypeModal.querySelector('#conjunction-btn');
        const cancelBtn = connectionTypeModal.querySelector('#connection-cancel');

        const chainHandler = () => createConnection(fromNode, toNode, 'chain');
        const conjunctionHandler = () => createConnection(fromNode, toNode, 'conjunction');

        const close = () => {
            connectionTypeModal.style.display = "none";
            chainBtn.removeEventListener('click', chainHandler);
            conjunctionBtn.removeEventListener('click', conjunctionHandler);
            cancelBtn.removeEventListener('click', close);
            connectingNode = null;
            renderCurrentStep();
        };

        const createConnection = (from, to, type) => {
            if (investigationState.diagram.connections.some(c => c.from === from.id && c.to === to.id)) {
                close(); return;
            }
            investigationState.diagram.connections.push({ from: from.id, to: to.id, type });
            saveState();
            close();
        };

        chainBtn.addEventListener('click', chainHandler);
        conjunctionBtn.addEventListener('click', conjunctionHandler);
        cancelBtn.addEventListener('click', close);
    }

    // --- INTEGRACIÓN CON LA API DE GEMINI ---
    async function callGeminiAPI(prompt, isJson = false) {
        loadingOverlay.style.display = 'flex';
        const apiKey = "";
        const model = 'gemini-2.5-flash-preview-05-20'; // Modelo actualizado
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        const payload = { contents: [{ parts: [{ text: prompt }] }], generationConfig: {} };
        if (isJson) { payload.generationConfig.responseMimeType = "application/json"; }

        try {
            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) { throw new Error(`Error de API: ${response.statusText}`); }
            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) { return isJson ? JSON.parse(text) : text; } 
            else { throw new Error("La respuesta de la API no contiene texto."); }
        } catch (error) {
            console.error("Error al llamar a Gemini API:", error);
            showConfirmation("Error de IA", "Hubo un error al comunicarse con la IA. Por favor, intenta de nuevo.", () => {}, {showCancel: false, okText: 'Entendido'});
            return null;
        } finally {
            loadingOverlay.style.display = 'none';
        }
    }


    newInvestigationBtn.addEventListener('click', () => { showConfirmation( 'Iniciar Nueva Investigación', 'Esto borrará todos los datos actuales. ¿Estás seguro de que quieres continuar?', resetState ); });

    // --- IMPORTAR / EXPORTAR ---
    exportBtn.addEventListener('click', () => {
        const dataStr = JSON.stringify(investigationState, null, 2);
        const dataUri = 'data:text/plain;charset=utf-8,'+ encodeURIComponent(dataStr);
        const exportFileDefaultName = 'investigacion_accidente.txt';
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    });

    importInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importedState = JSON.parse(e.target.result);
                if (importedState.general && importedState.facts && importedState.diagram) {
                    investigationState = importedState;
                    saveState();
                    currentStep = 1;
                    updateNav();
                } else { showConfirmation('Error de Archivo', 'El archivo no parece ser un archivo de investigación válido.', () => {}, {showCancel: false, okText: 'Entendido'}); }
            } catch (error) { showConfirmation('Error de Lectura', 'Error al leer el archivo. Asegúrate de que es un archivo de investigación válido.', () => {}, {showCancel: false, okText: 'Entendido'}); }
        };
        reader.readAsText(file);
        event.target.value = '';
    });

    // --- NAVEGACIÓN ---
    function updateNav() {
        renderCurrentStep();
        tabs.forEach(tab => { tab.classList.toggle('tab-active', parseInt(tab.dataset.step) === currentStep); });
        
        const isKnowledgeBase = currentStep === 7;
        prevBtn.style.display = isKnowledgeBase ? 'none' : 'flex';
        nextBtn.style.display = isKnowledgeBase ? 'none' : 'flex';

        prevBtn.disabled = currentStep === 0;
        nextBtn.disabled = currentStep === totalSteps;
        nextBtn.innerHTML = currentStep === totalSteps ? 'Finalizar <i class="fas fa-check"></i>' : 'Siguiente <i class="fas fa-arrow-right"></i>';
        updateStepCompletion();
    }

    function updateStepCompletion() {
        const step1Complete = investigationState.general.date && investigationState.general.location && investigationState.general.description;
        updateTabCheck(1, step1Complete);
        const step2Complete = investigationState.information.length > 20;
        updateTabCheck(2, step2Complete);
        const step3Complete = investigationState.facts.length > 0;
        updateTabCheck(3, step3Complete);
        const step4Complete = investigationState.diagram.nodes && investigationState.diagram.nodes.some(n => n.finalEvent);
        updateTabCheck(4, step4Complete);
        const step5Complete = Object.keys(investigationState.measures).length > 0 && Object.values(investigationState.measures).some(m => m.corrective || m.preventive);
        updateTabCheck(5, step5Complete);
    }

    function updateTabCheck(stepIndex, isComplete) {
        const tab = document.querySelector(`.tab[data-step='${stepIndex}']`);
        if (!tab) return;
        const checkIcon = tab.querySelector('.fa-check-circle');
        if (isComplete) {
            if (!checkIcon) { tab.insertAdjacentHTML('beforeend', '<i class="fas fa-check-circle text-green-500 ml-2"></i>'); }
        } else {
            if (checkIcon) { checkIcon.remove(); }
        }
    }

    tabs.forEach(tab => { tab.addEventListener('click', e => { e.preventDefault(); currentStep = parseInt(e.target.closest('.tab').dataset.step); updateNav(); }); });
    nextBtn.addEventListener('click', () => { if (currentStep < totalSteps) { currentStep++; updateNav(); } });
    prevBtn.addEventListener('click', () => { if (currentStep > 0) { currentStep--; updateNav(); } });

    // --- LÓGICA DE PLANTILLAS Y RENDERIZADO ---
    function renderCurrentStep() {
        let content = '';
        switch(currentStep) {
            case 0: content = getInstructionsHTML(); break;
            case 1: content = getGeneralDataHTML(); break;
            case 2: content = getInformationCollectionHTML(); break;
            case 3: content = getFactsListHTML(); break;
            case 4: content = getDiagramHTML(); break;
            case 5: content = getMeasuresHTML(); break;
            case 6: content = getReportHTML(); break;
            case 7: content = getKnowledgeBaseHTML(); break;
        }
        appContainer.innerHTML = content;
        attachEventListenersForStep(currentStep);
    }
    
    function attachEventListenersForStep(step) {
        switch(step) {
            case 0: attachInstructionsListeners(); break;
            case 1: attachGeneralDataListeners(); break;
            case 2: attachInformationCollectionListeners(); break;
            case 3: attachFactsListListeners(); break;
            case 4: attachDiagramListeners(); break;
            case 5: attachMeasuresListeners(); break;
            case 6: attachReportListeners(); break;
            // el caso 7 no tiene listeners
        }
    }
    
    // --- PLANTILLAS HTML PARA CADA PASO ---
    function getInstructionsHTML() {
        return `<div class="prose max-w-none">
            <h2 class="text-3xl font-bold mb-4">Bienvenido a la Herramienta de Investigación de Accidentes</h2>
            <p>Esta aplicación te guiará paso a paso para realizar un análisis de causas raíz utilizando el <strong>Método del Árbol de Causas</strong>, ahora potenciado con Inteligencia Artificial para agilizar tu trabajo y ofrecerte sugerencias expertas.</p>
            <div class="flex items-center gap-4 my-6">
                <button id="load-example-btn" class="flex items-center gap-2 bg-amber-100 text-amber-800 px-4 py-2 rounded-lg hover:bg-amber-200 font-semibold transition-colors"><i class="fas fa-file-import"></i> Cargar Caso de Ejemplo Guiado</button>
            </div>
             <div class="my-6 p-4 bg-gradient-to-r from-cyan-50 to-blue-50 border-l-4 border-cyan-500 rounded-r-lg">
                <h3 class="font-bold text-cyan-800 text-lg">✨ Funcionalidades con IA de Gemini</h3>
                <ul class="list-disc pl-5 mt-2 space-y-2 text-cyan-900">
                    <li><strong>Reconstrucción de Secuencia:</strong> En el Paso 2, la IA puede analizar tu relato y crear una secuencia cronológica de los eventos para ayudarte a ordenar las ideas.</li>
                    <li><strong>Sugerencia Automática de Hechos:</strong> En el Paso 2, la IA puede analizar tu relato y extraer los hechos clave por ti.</li>
                    <li><strong>Análisis y Resumen de Causas Raíz:</strong> En el Paso 5, la IA puede generar un resumen ejecutivo que explique cómo se conectan las diferentes causas raíz identificadas.</li>
                    <li><strong>Sugerencia de Medidas Preventivas:</strong> En el Paso 5, la IA actúa como un experto en seguridad, proponiendo medidas para cada causa raíz.</li>
                </ul>
            </div>
            <h3 class="text-2xl font-semibold mt-6">Paso a Paso Detallado</h3>
            <div class="space-y-4">
                <p><strong>Paso 1: Datos Generales:</strong> Comienza registrando la información básica del evento.</p>
                <p><strong>Paso 2: Recopilación:</strong> Anota toda la información objetiva. Luego, usa los botones de IA para reconstruir la secuencia y extraer los hechos automáticamente.</p>
                <p><strong>Paso 3: Listado de Hechos:</strong> Revisa y edita los hechos para que cada uno sea una afirmación corta, precisa e innegable.</p>
                <p><strong>Paso 4: Diagrama de Causas:</strong> Arrastra los hechos al panel y conéctalos lógicamente. Recuerda usar las herramientas avanzadas:</p>
                <ul class="list-disc pl-5 space-y-2">
                    <li><strong>Navegación y Zoom:</strong> Usa la <strong>rueda del ratón</strong> para acercar o alejar la vista. <strong>Arrastra el fondo</strong> del lienzo para moverte por el diagrama.</li>
                    <li><strong>Exportar Imagen <i class="fas fa-camera"></i>:</strong> Descarga una imagen de tu diagrama para incluirla en tus informes.</li>
                </ul>
                <p><strong>Paso 5: Medidas:</strong> Para cada causa raíz, usa la IA para obtener sugerencias de medidas y un resumen global del análisis.</p>
                <p><strong>Paso 6: Informe Final:</strong> La aplicación generará un informe completo y profesional con todos los datos recopilados, listo para ser impreso o guardado como PDF.</p>
            </div>
            <h3 class="text-2xl font-semibold mt-8">Gestión de Investigaciones</h3>
            <div class="space-y-4">
                <p><strong><i class="fas fa-download text-slate-500 mr-2"></i>Exportar:</strong> Guarda tu progreso completo en cualquier momento. Al hacer clic en "Exportar", se descargará un archivo de texto (<code>.txt</code>).</p>
                <p><strong><i class="fas fa-upload text-slate-500 mr-2"></i>Importar:</strong> Carga una investigación previamente guardada. <strong>Importante:</strong> Al importar un archivo se reemplazarán todos los datos de la investigación que tengas en curso.</p>
            </div>
        </div>`;
    }

    function getGeneralDataHTML() {
        let personsHTML = investigationState.persons.map((p, index) => `<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 p-4 border rounded-lg bg-gray-50 relative" data-person-index="${index}"><div class="absolute top-2 right-2"><button type="button" class="remove-person-btn text-gray-400 hover:text-red-500 text-sm"><i class="fas fa-times-circle"></i></button></div><div class="input-wrapper"><i class="fas fa-user input-icon"></i><input type="text" placeholder="Nombre y Apellido" class="person-name mt-1 block w-full rounded-md border-gray-300 shadow-sm input-with-icon" value="${p.name || ''}"></div><div class="input-wrapper"><i class="fas fa-briefcase input-icon"></i><input type="text" placeholder="Ej: Operario de máquina" class="person-role mt-1 block w-full rounded-md border-gray-300 shadow-sm input-with-icon" value="${p.role || ''}"></div><div class="input-wrapper"><i class="fas fa-notes-medical input-icon"></i><input type="text" placeholder="Ej: Fractura, contusión..." class="person-consequence mt-1 block w-full rounded-md border-gray-300 shadow-sm input-with-icon" value="${p.consequence || ''}"></div></div>`).join('');
        return `<h2 class="text-2xl font-semibold mb-6 text-gray-700">Paso 1: Datos Generales del Suceso</h2>
            <form id="general-data-form" class="space-y-8">
                <div><div class="grid grid-cols-1 md:grid-cols-2 gap-6"><div class="input-wrapper"><label for="accident-date" class="block text-sm font-medium text-gray-700">Fecha del Accidente</label><i class="fas fa-calendar-alt input-icon mt-6"></i><input type="date" id="accident-date" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm input-with-icon" value="${investigationState.general.date || ''}"></div><div class="input-wrapper"><label for="accident-time" class="block text-sm font-medium text-gray-700">Hora del Accidente</label><i class="fas fa-clock input-icon mt-6"></i><input type="time" id="accident-time" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm input-with-icon" value="${investigationState.general.time || ''}"></div><div class="md:col-span-2 input-wrapper"><label for="accident-location" class="block text-sm font-medium text-gray-700">Lugar del Accidente</label><i class="fas fa-map-marker-alt input-icon mt-6"></i><input type="text" id="accident-location" placeholder="Ej: Taller de mantenimiento, Bodega central..." class="mt-1 block w-full rounded-md border-gray-300 shadow-sm input-with-icon" value="${investigationState.general.location || ''}"></div><div class="md:col-span-2"><label for="accident-description" class="block text-sm font-medium text-gray-700">Descripción Breve del Suceso</label><textarea id="accident-description" rows="4" placeholder="Describa qué sucedió, quién resultó afectado y cuál fue la consecuencia principal." class="mt-1 block w-full rounded-md border-gray-300 shadow-sm">${investigationState.general.description || ''}</textarea></div></div></div>
                <div><h3 class="text-lg font-medium text-gray-800 border-b pb-2 mb-4">Persona(s) Involucrada(s)</h3><div id="persons-involved-container">${personsHTML}</div><button type="button" id="add-person-btn" class="mt-2 text-sm text-blue-600 hover:text-blue-800 font-semibold"><i class="fas fa-plus-circle mr-1"></i> Añadir Persona</button></div>
                <div><h3 class="text-lg font-medium text-gray-800 border-b pb-2 mb-4">Datos del Investigador</h3><div class="grid grid-cols-1 sm:grid-cols-2 gap-6"><div class="input-wrapper"><label for="investigator-name" class="block text-sm font-medium text-gray-700">Nombre y Apellido</label><i class="fas fa-user-tie input-icon mt-6"></i><input type="text" id="investigator-name" placeholder="Nombre del profesional a cargo" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm input-with-icon" value="${investigationState.investigator.name || ''}"></div><div class="input-wrapper"><label for="investigator-role" class="block text-sm font-medium text-gray-700">Cargo / Función</label><i class="fas fa-id-badge input-icon mt-6"></i><input type="text" id="investigator-role" placeholder="Ej: Prevencionista de Riesgos" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm input-with-icon" value="${investigationState.investigator.role || ''}"></div><div class="input-wrapper sm:col-span-2"><label for="investigator-date" class="block text-sm font-medium text-gray-700">Fecha de la Investigación</label><i class="fas fa-calendar-check input-icon mt-6"></i><input type="date" id="investigator-date" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm input-with-icon" value="${investigationState.investigator.date || ''}"></div></div></div>
            </form>`;
    }

    function getInformationCollectionHTML() {
        return `<h2 class="text-2xl font-semibold mb-4 text-gray-700">Paso 2: Recopilación de Información</h2>
            <div class="flex justify-between items-center mb-4">
                <p class="text-gray-600">Registre aquí toda la información objetiva obtenida.</p>
                <div class="flex gap-2">
                    <button id="reconstruct-sequence-btn" class="flex items-center gap-2 bg-amber-50 text-amber-700 px-4 py-2 rounded-lg hover:bg-amber-100 font-semibold transition-colors text-sm">✨ Reconstruir Secuencia</button>
                    <button id="suggest-facts-btn" class="flex items-center gap-2 bg-cyan-50 text-cyan-700 px-4 py-2 rounded-lg hover:bg-cyan-100 font-semibold transition-colors text-sm">✨ Sugerir Hechos</button>
                </div>
            </div>
            <textarea id="information-collection" rows="15" placeholder="Ej: Entrevista con el accidentado: 'Estaba cambiando la pieza X cuando la máquina se activó...'. Documento Y: 'El último mantenimiento fue el...'." class="w-full p-3 border rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500">${investigationState.information || ''}</textarea>`;
    }

    function getFactsListHTML() {
        let factsHTML = investigationState.facts.map((fact, index) => `<li class="mb-2 flex justify-between items-center bg-gray-50 p-3 rounded-lg"><span class="break-words w-11/12">${fact}</span><button data-index="${index}" class="remove-fact-btn text-gray-400 hover:text-red-500"><i class="fas fa-trash"></i></button></li>`).join('');
        if (investigationState.facts.length === 0) { factsHTML = '<li class="text-gray-500 text-center py-4">Aún no se han añadido hechos.</li>'; }
        return `<h2 class="text-2xl font-semibold mb-4 text-gray-700">Paso 3: Listado de Hechos Constatados</h2>
            <p class="mb-4 text-gray-600">Extraiga del relato anterior los hechos concretos, objetivos y probados. Cada hecho debe ser una frase corta y precisa.</p>
            <div class="flex mb-4"><input type="text" id="new-fact-input" placeholder="Añadir un nuevo hecho y presionar Enter..." class="flex-grow p-3 border rounded-l-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500"><button id="add-fact-btn" class="bg-blue-500 text-white px-5 py-2 rounded-r-lg hover:bg-blue-600 font-semibold"><i class="fas fa-plus"></i> Añadir</button></div>
            <ul id="facts-list" class="space-y-2">${factsHTML}</ul>`;
    }

    function getDiagramHTML() {
        const availableFacts = investigationState.facts.filter((fact, index) => !investigationState.diagram.nodes.some(node => node.id === `fact-${index}`));
        let factsListHTML = availableFacts.map((fact, i) => `<div class="p-3 mb-2 bg-white border rounded-lg cursor-pointer hover:bg-blue-50" draggable="true" data-id="fact-${investigationState.facts.indexOf(fact)}" data-text="${fact}">${fact}</div>`).join('');
        if(availableFacts.length === 0 && investigationState.facts.length > 0) { factsListHTML = `<p class="text-center text-gray-500 p-4">Todos los hechos están en el diagrama.</p>`; } 
        else if (investigationState.facts.length === 0) { factsListHTML = `<p class="text-center text-gray-500 p-4">Añada hechos en el Paso 3 para empezar.</p>`; }

        return `<h2 class="text-2xl font-semibold mb-4 text-gray-700">Paso 4: Construcción del Diagrama</h2>
            <div class="flex flex-col md:flex-row gap-6">
                <div class="md:w-1/3">
                    <div class="flex justify-between items-center mb-2">
                        <h3 class="font-semibold text-lg">Hechos Disponibles</h3>
                        <div class="flex gap-2">
                            <button id="reset-view-btn" class="flex items-center gap-2 bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-200 font-semibold transition-colors text-xs" title="Restaurar Vista"><i class="fas fa-expand"></i></button>
                            <button id="export-diagram-btn" class="flex items-center gap-2 bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-200 font-semibold transition-colors text-xs"><i class="fas fa-camera"></i> Exportar</button>
                        </div>
                    </div>
                    <div id="diagram-facts-list" class="bg-gray-50 p-4 rounded-lg h-96 overflow-y-auto border">${factsListHTML}</div>
                    <div class="mt-4 text-sm text-gray-600 prose-sm">
                        <p><strong>Instrucciones del Diagrama:</strong></p>
                        <ol class="list-decimal pl-5 space-y-1">
                            <li><strong>Navegar:</strong> Arrastra el fondo para moverte. Usa la rueda del ratón para hacer zoom.</li>
                            <li><strong>Suceso Final:</strong> Doble clic en un hecho para marcarlo como evento final.</li>
                            <li><strong>Añadir:</strong> Arrastra hechos al panel de la derecha.</li>
                            <li><strong>Conectar:</strong> Clic en el <strong>efecto</strong>, pulsa <i class="fas fa-link text-cyan-600"></i>, y luego en la <strong>causa</strong>.</li>
                            <li><strong>Foco:</strong> Clic en un hecho y pulsa <i class="fas fa-bullseye text-slate-500"></i> para resaltar su cadena causal.</li>
                        </ol>
                    </div>
                </div>
                <div class="md:w-2/3 relative h-[600px] bg-slate-100 rounded-lg border-2 border-dashed border-slate-300 overflow-hidden" id="diagram-canvas">
                    <div id="diagram-transform-container">
                        <svg id="diagram-svg" class="absolute top-0 left-0" style="width:200%; height:200%;"></svg>
                        <!-- Los nodos se renderizarán aquí por JS -->
                    </div>
                </div>
            </div>`;
    }

    function getMeasuresHTML() {
        const rootCauses = investigationState.diagram.nodes.filter(n => 
            !n.isExternal &&
            !investigationState.diagram.connections.some(c => c.to === n.id) &&
            investigationState.diagram.connections.some(c => c.from === n.id)
        );

        if(rootCauses.length === 0) {
            return `<h2 class="text-2xl font-semibold mb-4 text-gray-700">Paso 5: Medidas</h2>
                    <div class="text-center py-10 bg-gray-50 rounded-lg">
                        <i class="fas fa-sitemap text-4xl text-gray-300 mb-4"></i>
                        <p class="text-gray-500">Complete el diagrama para identificar las causas raíz.</p>
                        <p class="text-sm text-gray-400 mt-2">(Una causa raíz tiene flechas saliendo de ella, pero ninguna llegando).</p>
                    </div>`;
        }
        
        const categories = ["Factor Organizacional / Gestión", "Factor Técnico / Material", "Factor Tarea", "Factor Humano", "Factor Ambiental"];
        let measuresHTML = rootCauses.map(cause => {
            const measure = investigationState.measures[cause.id] || { corrective: '', fpa: '', preventive: '', category: '' };
            let selectedCategoriesHTML = `<option value="">-- Seleccionar categoría --</option>` + categories.map(c => `<option value="${c}" ${measure.category === c ? 'selected' : ''}>${c}</option>`).join('');
            return `<div class="mb-6 p-4 border rounded-lg bg-gray-50" data-cause-id="${cause.id}">
                <div class="flex justify-between items-start mb-3"><h4 class="font-semibold text-md text-cyan-700 flex-grow"><i class="fas fa-key mr-2"></i>Causa Raíz: ${cause.text}</h4><select class="measure-category text-xs rounded border-gray-300 ml-4">${selectedCategoriesHTML}</select></div>
                <div class="flex justify-end mb-4"><button class="suggest-measures-btn flex items-center gap-2 bg-cyan-50 text-cyan-700 px-3 py-1.5 rounded-lg hover:bg-cyan-100 font-semibold transition-colors text-xs">✨ Sugerir Medidas con IA</button></div>
                <div class="space-y-4">
                     <div><label class="block text-sm font-medium text-gray-700">Medida Correctiva (Inmediata)</label><textarea rows="2" class="measure-corrective mt-1 block w-full rounded-md border-gray-300" placeholder="Acción para corregir el problema puntual.">${measure.corrective || ''}</textarea></div>
                    <div><label class="block text-sm font-medium text-gray-700">Factor Potencial de Accidente (Generalización)</label><textarea rows="2" class="measure-fpa mt-1 block w-full rounded-md border-gray-300" placeholder="¿Cómo este fallo podría causar otros accidentes?">${measure.fpa || ''}</textarea></div>
                    <div><label class="block text-sm font-medium text-gray-700">Medida Preventiva (Sistémica)</label><textarea rows="2" class="measure-preventive mt-1 block w-full rounded-md border-gray-300" placeholder="Acción para eliminar el Factor Potencial de Accidente.">${measure.preventive || ''}</textarea></div>
                </div>
            </div>`;
        }).join('');

        return `<h2 class="text-2xl font-semibold mb-4 text-gray-700">Paso 5: Medidas</h2>
                <p class="mb-4 text-gray-600">Para cada causa raíz identificada, categorícela y defina las siguientes acciones:</p>
                <div class="mb-6 flex justify-end">
                    <button id="summarize-causes-btn" class="flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-100 font-semibold transition-colors text-sm">✨ Analizar y Resumir Causas Raíz</button>
                </div>
                <div id="summary-container" class="my-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-lg ${investigationState.rootCauseSummary ? '' : 'hidden'}">
                    <h3 class="font-bold text-blue-800 text-lg">Resumen de Análisis de Causas Raíz (Generado por IA)</h3>
                    <div id="summary-content" class="prose prose-sm max-w-none mt-2 text-blue-900">${investigationState.rootCauseSummary || ''}</div>
                </div>
                <div id="measures-container">${measuresHTML}</div>`;
    }

    function getReportHTML() {
        return `<h2 class="text-2xl font-semibold mb-4 text-gray-700">Paso 6: Informe Final de la Investigación</h2>
            <div id="report-controls" class="flex justify-end mb-4">
                 <button id="generate-report-btn" class="flex items-center gap-2 bg-cyan-600 text-white px-4 py-2 rounded-lg hover:bg-cyan-700 font-semibold"><i class="fas fa-file-invoice mr-2"></i> Generar Vista Previa del Informe</button>
            </div>
            <div id="report-content-wrapper" class="prose max-w-none p-6 border rounded-lg bg-gray-50">
                 <div class="text-center p-8 text-slate-500">
                    <i class="fas fa-file-alt text-4xl mb-4"></i>
                    <p>La vista previa de tu informe aparecerá aquí.</p>
                 </div>
            </div>`;
    }

    // --- EVENT LISTENERS ESPECÍFICOS PARA CADA PASO ---
    
    function attachInstructionsListeners() {
        document.getElementById('load-example-btn').addEventListener('click', () => {
            showConfirmation('Cargar Caso de Ejemplo', 'Esto borrará toda la información actual y cargará un caso de demostración. ¿Estás seguro?', loadExampleCase);
        });
    }

    function attachGeneralDataListeners() {
        const form = document.getElementById('general-data-form');
        form.addEventListener('input', (e) => {
            const target = e.target; const id = target.id;
            if (id.startsWith('accident-')) { investigationState.general[id.replace('accident-', '')] = target.value; } 
            else if (target.closest('[data-person-index]')) { const index = target.closest('[data-person-index]').dataset.personIndex; const key = target.classList.contains('person-name') ? 'name' : (target.classList.contains('person-role') ? 'role' : 'consequence'); investigationState.persons[index][key] = target.value; } 
            else if (id.startsWith('investigator-')) { investigationState.investigator[id.replace('investigator-', '')] = target.value; }
            saveState();
        });
        document.getElementById('add-person-btn').addEventListener('click', () => { investigationState.persons.push({ name: '', role: '', consequence: '' }); renderCurrentStep(); });
        document.getElementById('persons-involved-container').addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.remove-person-btn');
            if (removeBtn) {
                if (investigationState.persons.length > 1) { const index = removeBtn.closest('[data-person-index]').dataset.personIndex; investigationState.persons.splice(index, 1); saveState(); renderCurrentStep(); } 
                else { showConfirmation('Atención', 'Debe haber al menos una persona involucrada.', () => {}, {showCancel: false, okText: 'Entendido', okClass: 'bg-cyan-600 text-white hover:bg-cyan-700'}); }
            }
        });
    }

    function attachInformationCollectionListeners() {
        const textarea = document.getElementById('information-collection');
        textarea.addEventListener('input', () => { investigationState.information = textarea.value; saveState(); });

        const sequenceModal = document.getElementById('sequence-modal');
        if (sequenceModal) {
            document.getElementById('reconstruct-sequence-btn').addEventListener('click', async () => {
                const narrative = investigationState.information;
                if (narrative.trim().length < 50) { 
                    showConfirmation('Información Insuficiente', 'Por favor, escribe un relato más detallado (mínimo 50 caracteres) antes de usar la IA.', () => {}, {showCancel: false, okText: 'Entendido', okClass: 'bg-cyan-600 text-white hover:bg-cyan-700'});
                    return; 
                }
                const prompt = `Analiza el siguiente relato de un accidente y reconstruye la secuencia cronológica de los eventos clave en una lista ordenada. Responde únicamente con la lista. Sé claro y conciso. Relato: "${narrative}"`;
                const result = await callGeminiAPI(prompt);
                if (result) {
                    const formattedResult = result.split('\n').map(item => item.trim().replace(/^\d+\.\s*/, '')).filter(item => item).map(item => `<li>${item}</li>`).join('');
                    sequenceModal.querySelector('#sequence-list').innerHTML = `<ol class="list-decimal pl-5">${formattedResult}</ol>`;
                    sequenceModal.style.display = 'flex';
                }
            });

            sequenceModal.querySelector('#sequence-close-btn').addEventListener('click', () => {
                sequenceModal.style.display = 'none';
            });
        }
        
        document.getElementById('suggest-facts-btn').addEventListener('click', async () => {
            const narrative = investigationState.information;
            if (narrative.trim().length < 50) { 
                showConfirmation('Información Insuficiente', 'Por favor, escribe un relato más detallado (mínimo 50 caracteres) antes de usar la IA.', () => {}, {showCancel: false, okText: 'Entendido', okClass: 'bg-cyan-600 text-white hover:bg-cyan-700'});
                return; 
            }
            const prompt = `Eres un experto en investigación de accidentes laborales usando el método del Árbol de Causas. Analiza el siguiente relato de un accidente y extrae una lista de hechos objetivos, cortos, precisos e innegables. No incluyas opiniones, juicios de valor, suposiciones o información que no esté explícita en el texto. Devuelve solo un array JSON de strings. Relato: "${narrative}"`;
            const result = await callGeminiAPI(prompt, true);
            if (result && Array.isArray(result)) { showFactSelectionModal(result); }
        });
    }

    function attachFactsListListeners() {
        const input = document.getElementById('new-fact-input');
        const addBtn = document.getElementById('add-fact-btn');
        const addFact = () => {
            const factText = input.value.trim();
            if (factText) { investigationState.facts.push(factText); saveState(); input.value = ''; renderCurrentStep(); const lastFact = document.querySelector('#facts-list li:last-child'); if(lastFact) lastFact.classList.add('new-item'); }
            input.focus();
        };
        addBtn.addEventListener('click', addFact);
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); addFact(); } });
        document.getElementById('facts-list').addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.remove-fact-btn');
            if(removeBtn) { const index = removeBtn.dataset.index; const factId = `fact-${index}`; investigationState.facts.splice(index, 1); investigationState.diagram.nodes = investigationState.diagram.nodes.filter(n => n.id !== factId); investigationState.diagram.connections = investigationState.diagram.connections.filter(c => c.from !== factId && c.to !== factId); saveState(); renderCurrentStep(); }
        });
    }

    function attachDiagramListeners() {
        const list = document.getElementById('diagram-facts-list');
        const canvas = document.getElementById('diagram-canvas');
        const transformContainer = document.getElementById('diagram-transform-container');
        const svg = document.getElementById('diagram-svg');
        let draggedFact = null;
        let focusNodeId = null;

        // --- Lógica de Paneo y Zoom ---
        let scale = 1, panX = 0, panY = 0, isPanning = false, startPanX, startPanY;

        function applyTransform() {
            transformContainer.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
        }

        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const worldX = (mouseX - panX) / scale;
            const worldY = (mouseY - panY) / scale;

            const zoomFactor = 0.1;
            const delta = e.deltaY > 0 ? -zoomFactor : zoomFactor;
            const newScale = Math.max(0.2, Math.min(3, scale + delta));

            panX = mouseX - worldX * newScale;
            panY = mouseY - worldY * newScale;
            scale = newScale;

            applyTransform();
        });

        canvas.addEventListener('mousedown', e => {
            if (e.target === canvas || e.target === transformContainer || e.target === svg) {
                isPanning = true;
                startPanX = e.clientX - panX;
                startPanY = e.clientY - panY;
                canvas.style.cursor = 'grabbing';
            }
        });
        
        canvas.addEventListener('mousemove', e => {
            if (isPanning) {
                panX = e.clientX - startPanX;
                panY = e.clientY - startPanY;
                applyTransform();
            }
        });

        canvas.addEventListener('mouseup', () => {
            isPanning = false;
            canvas.style.cursor = 'grab';
        });

        canvas.addEventListener('mouseleave', () => {
            isPanning = false;
             canvas.style.cursor = 'grab';
        });
        
        document.getElementById('reset-view-btn').addEventListener('click', () => {
            scale = 1; panX = 0; panY = 0;
            applyTransform();
        });
        // --- Fin de Paneo y Zoom ---

        list.addEventListener('dragstart', e => { if (e.target.draggable) draggedFact = e.target; });
        canvas.addEventListener('dragover', e => e.preventDefault());
        canvas.addEventListener('drop', e => {
            e.preventDefault();
            if (draggedFact) {
                const { id, text } = draggedFact.dataset;
                if (!investigationState.diagram.nodes.some(n => n.id === id)) {
                    const rect = canvas.getBoundingClientRect();
                    // Ajustar coordenadas al soltar según el paneo y zoom actual
                    const x = (e.clientX - rect.left - panX) / scale;
                    const y = (e.clientY - rect.top - panY) / scale;
                    investigationState.diagram.nodes.push({ id, text, x, y, finalEvent: false, isExternal: false });
                    saveState();
                    renderCurrentStep();
                }
                draggedFact = null;
            }
        });

        list.addEventListener('dblclick', e => {
            const target = e.target.closest('[data-id]');
            if (!target) return;
            const { id, text } = target.dataset;
            if (id && text && !investigationState.diagram.nodes.some(n => n.id === id)) { 
                investigationState.diagram.nodes.forEach(n => n.finalEvent = false); 
                // Centrar el nuevo evento final en la vista actual
                const rect = canvas.getBoundingClientRect();
                const x = ((rect.width / 2) - 70 - panX) / scale;
                const y = ((rect.height / 2) - 40 - panY) / scale;
                investigationState.diagram.nodes.push({ id, text, x, y, finalEvent: true, isExternal: false }); 
                saveState(); 
                renderCurrentStep(); 
            }
        });
        
        renderDiagramNodes();
        drawConnections();

        function renderDiagramNodes() {
            // Limpiar nodos existentes para evitar duplicados
            transformContainer.querySelectorAll('.fact-node').forEach(n => n.remove());

            investigationState.diagram.nodes.forEach(node => {
                const nodeEl = document.createElement('div');
                nodeEl.className = 'fact-node';
                nodeEl.id = node.id;
                if(node.finalEvent) nodeEl.classList.add('final-event');
                if(node.isExternal) { nodeEl.classList.add('is-external'); nodeEl.innerHTML += `<i class="fas fa-cloud absolute top-1 right-1 text-amber-600 text-xs"></i>`; }
                if(connectingNode && connectingNode.id === node.id) nodeEl.classList.add('is-connecting');
                nodeEl.style.left = `${node.x}px`; nodeEl.style.top = `${node.y}px`;
                const textEl = document.createElement('span'); textEl.textContent = node.text;
                const actionsEl = document.createElement('div');
                actionsEl.className = 'node-actions';
                actionsEl.innerHTML = `<button class="node-action-btn text-slate-500 focus-btn" title="Modo Foco"><i class="fas fa-bullseye"></i></button><button class="node-action-btn text-cyan-600 connect-btn" title="Conectar Causa"><i class="fas fa-link"></i></button><button class="node-action-btn text-amber-500 external-btn" title="Marcar como Condición Externa"><i class="fas fa-cloud"></i></button><button class="node-action-btn text-red-500 remove-node-btn" title="Eliminar Hecho"><i class="fas fa-trash"></i></button>`;
                nodeEl.appendChild(textEl);
                nodeEl.appendChild(actionsEl);
                transformContainer.appendChild(nodeEl);
                makeNodeDraggable(nodeEl, node);
            });
            if (focusNodeId) { applyFocusMode(focusNodeId); }
        }
        
        function makeNodeDraggable(element, node) {
            let startClientX, startClientY, startNodeX, startNodeY;
            let isDragging = false;

            element.addEventListener('mousedown', e => {
                if (e.target.closest('.node-action-btn')) return;
                e.preventDefault();
                e.stopPropagation();

                isDragging = true;
                startClientX = e.clientX;
                startClientY = e.clientY;
                startNodeX = node.x;
                startNodeY = node.y;
                
                canvas.style.cursor = 'grabbing';
                element.style.zIndex = '20';
            });

            const onMouseMove = (e) => {
                if(isDragging) {
                    const deltaX = e.clientX - startClientX;
                    const deltaY = e.clientY - startClientY;
                    node.x = startNodeX + (deltaX / scale);
                    node.y = startNodeY + (deltaY / scale);
                    element.style.left = `${node.x}px`;
                    element.style.top = `${node.y}px`;
                    drawConnections();
                }
            };
            
            const onMouseUp = () => {
                if (isDragging) {
                    isDragging = false;
                    canvas.style.cursor = 'grab';
                    element.style.zIndex = '10';
                    saveState();
                }
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }
        
        function drawConnections() {
            svg.innerHTML = '';
            const defs = `<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="arrow-head"></path></marker></defs>`;
            svg.insertAdjacentHTML('afterbegin', defs);
            investigationState.diagram.connections.forEach(conn => {
                const fromNode = transformContainer.querySelector(`#${conn.from}`);
                const toNode = transformContainer.querySelector(`#${conn.to}`);
                if (!fromNode || !toNode) return;
                const fromX = parseFloat(fromNode.style.left) + fromNode.offsetWidth / 2;
                const fromY = parseFloat(fromNode.style.top) + fromNode.offsetHeight / 2;
                const toX = parseFloat(toNode.style.left) + toNode.offsetWidth / 2;
                const toY = parseFloat(toNode.style.top) + toNode.offsetHeight / 2;
                const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', fromX); line.setAttribute('y1', fromY); line.setAttribute('x2', toX); line.setAttribute('y2', toY);
                line.classList.add('connector');
                line.dataset.from = conn.from; line.dataset.to = conn.to;
                if (conn.type === 'conjunction') { line.style.strokeDasharray = '5, 5'; }
                g.appendChild(line);
                line.setAttribute('marker-end', 'url(#arrow)');
                svg.appendChild(g);
            });
        }
        
        function applyFocusMode(nodeId) {
            canvas.classList.add('focus-mode');
            const nodesToHighlight = new Set();
            function traceAncestors(id) {
                if (nodesToHighlight.has(id)) return;
                nodesToHighlight.add(id);
                const connectionsTo = investigationState.diagram.connections.filter(c => c.to === id);
                connectionsTo.forEach(conn => traceAncestors(conn.from));
            }
            traceAncestors(nodeId);

            transformContainer.querySelectorAll('.fact-node').forEach(el => {
                if (nodesToHighlight.has(el.id)) el.classList.add('highlight');
            });
            svg.querySelectorAll('g').forEach(g => {
                const line = g.querySelector('.connector');
                if (nodesToHighlight.has(line.dataset.from) && nodesToHighlight.has(line.dataset.to)) {
                    g.classList.add('highlight');
                }
            });
        }

        transformContainer.addEventListener('click', e => {
            const nodeEl = e.target.closest('.fact-node');
            if (!nodeEl) { 
                if (focusNodeId) {
                    focusNodeId = null;
                    canvas.classList.remove('focus-mode');
                    renderCurrentStep();
                }
                if (connectingNode) { connectingNode = null; renderCurrentStep(); } 
                return; 
            }
            const id = nodeEl.id;
            const targetNode = investigationState.diagram.nodes.find(n => n.id === id);
            
            if (e.target.closest('.focus-btn')) {
                focusNodeId = focusNodeId === id ? null : id;
                renderCurrentStep();
            }
            else if (e.target.closest('.connect-btn')) { connectingNode = targetNode; renderCurrentStep(); } 
            else if (e.target.closest('.external-btn')) { targetNode.isExternal = !targetNode.isExternal; saveState(); renderCurrentStep(); } 
            else if (e.target.closest('.remove-node-btn')) { investigationState.diagram.nodes = investigationState.diagram.nodes.filter(n => n.id !== id); investigationState.diagram.connections = investigationState.diagram.connections.filter(c => c.from !== id && c.to !== id); saveState(); renderCurrentStep(); } 
            else if (connectingNode) { if (targetNode && connectingNode.id !== targetNode.id) { showConnectionTypeModal(targetNode, connectingNode); } }
        });
        
        svg.addEventListener('click', e => {
            const g = e.target.closest('g');
            if (g && g.querySelector('.connector')) {
                const line = g.querySelector('.connector');
                const { from, to } = line.dataset;
                if (from && to) {
                    showConfirmation('Eliminar Conexión', '¿Estás seguro de que quieres eliminar esta conexión?', () => {
                        const connIndex = investigationState.diagram.connections.findIndex(c => c.from === from && c.to === to);
                        if (connIndex > -1) { investigationState.diagram.connections.splice(connIndex, 1); saveState(); renderCurrentStep(); }
                    });
                }
            }
        });
        
        const exportDiagramBtn = document.getElementById('export-diagram-btn');
        if(exportDiagramBtn) {
            exportDiagramBtn.addEventListener('click', () => {
                const originalTransform = transformContainer.style.transform;
                transformContainer.style.transform = ''; // Reset for capture

                const originalText = exportDiagramBtn.innerHTML;
                exportDiagramBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`; exportDiagramBtn.disabled = true;
                
                html2canvas(canvas, { backgroundColor: '#F1F5F9', scale: 2, logging: false, useCORS: true, onclone: (doc) => { doc.querySelectorAll('.node-actions').forEach(el => el.style.display = 'none'); } })
                .then(canvas => { const link = document.createElement('a'); link.download = 'arbol_de_causas.png'; link.href = canvas.toDataURL('image/png'); link.click(); })
                .finally(() => {
                    transformContainer.style.transform = originalTransform; // Restore view
                    exportDiagramBtn.innerHTML = `<i class="fas fa-camera"></i> Exportar`; exportDiagramBtn.disabled = false;
                });
            });
        }
    }

    function attachMeasuresListeners() {
        const container = document.getElementById('measures-container');
        if (!container) return;

        document.getElementById('summarize-causes-btn').addEventListener('click', async () => {
            const rootCauses = investigationState.diagram.nodes.filter(n => 
                !n.isExternal &&
                !investigationState.diagram.connections.some(c => c.to === n.id) &&
                investigationState.diagram.connections.some(c => c.from === n.id)
            ).map(n => n.text);

            if (rootCauses.length === 0) {
                showConfirmation('Sin Causas Raíz', 'No se han identificado causas raíz en el diagrama para analizar.', () => {}, {showCancel: false, okText: 'Entendido'});
                return;
            }

            const prompt = `Eres un experto en seguridad y salud laboral. A continuación se presenta una lista de causas raíz de un accidente. Genera un párrafo de resumen (máximo 150 palabras) que explique de forma coherente cómo estas fallas se combinaron para provocar el incidente. Enfócate en la interacción entre los factores. Lista de causas raíz:\n- ${rootCauses.join('\n- ')}`;

            const summary = await callGeminiAPI(prompt);
            if (summary) {
                investigationState.rootCauseSummary = summary;
                document.getElementById('summary-content').innerHTML = summary;
                document.getElementById('summary-container').classList.remove('hidden');
                saveState();
            }
        });

        container.addEventListener('input', e => {
            const causeId = e.target.closest('[data-cause-id]').dataset.causeId;
            if (!investigationState.measures[causeId]) { investigationState.measures[causeId] = { corrective: '', fpa: '', preventive: '', category: '' }; }
            if (e.target.classList.contains('measure-corrective')) { investigationState.measures[causeId].corrective = e.target.value; } 
            else if (e.target.classList.contains('measure-fpa')) { investigationState.measures[causeId].fpa = e.target.value; } 
            else if (e.target.classList.contains('measure-preventive')) { investigationState.measures[causeId].preventive = e.target.value; } 
            else if (e.target.classList.contains('measure-category')) { investigationState.measures[causeId].category = e.target.value; }
            saveState();
        });
        container.addEventListener('click', async e => {
            const suggestBtn = e.target.closest('.suggest-measures-btn');
            if (suggestBtn) {
                const causeContainer = suggestBtn.closest('[data-cause-id]');
                const causeId = causeContainer.dataset.causeId;
                const causeNode = investigationState.diagram.nodes.find(n => n.id === causeId);
                if (!causeNode) return;
                const prompt = `Eres un experto senior en seguridad y salud en el trabajo. Para la siguiente causa raíz de un accidente laboral: "${causeNode.text}", sugiere un plan de acción completo. Debes proveer:\n1.  Una 'Medida Correctiva' (acción inmediata y específica para solucionar el problema puntual).\n2.  Un 'Factor Potencial de Accidente' (la generalización del fallo sistémico que representa esta causa raíz).\n3.  Una 'Medida Preventiva' (una acción sistémica y a largo plazo para eliminar el Factor Potencial de Accidente).\nDevuelve la respuesta en formato JSON con las claves "corrective", "fpa" y "preventive".`;
                const result = await callGeminiAPI(prompt, true);
                if (result && result.corrective && result.fpa && result.preventive) {
                    causeContainer.querySelector('.measure-corrective').value = result.corrective;
                    causeContainer.querySelector('.measure-fpa').value = result.fpa;
                    causeContainer.querySelector('.measure-preventive').value = result.preventive;
                    causeContainer.querySelector('.measure-corrective').dispatchEvent(new Event('input', { bubbles: true }));
                    causeContainer.querySelector('.measure-fpa').dispatchEvent(new Event('input', { bubbles: true }));
                    causeContainer.querySelector('.measure-preventive').dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        });
    }

    function attachReportListeners() {
        const generateBtn = document.getElementById('generate-report-btn');
        const reportWrapper = document.getElementById('report-content-wrapper');
        const controlsContainer = document.getElementById('report-controls');

        generateBtn.addEventListener('click', async () => {
            generateBtn.disabled = true;
            generateBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Generando...`;
            reportWrapper.innerHTML = `<div class="text-center p-8"><i class="fas fa-spinner fa-spin text-2xl text-slate-500"></i><p class="mt-2 text-slate-600">Generando vista previa del informe...</p></div>`;
            
            const reportHTML = buildReportHTML();
            reportWrapper.innerHTML = reportHTML;
            
            controlsContainer.innerHTML = `<button id="print-report-btn" class="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 font-semibold"><i class="fas fa-print mr-2"></i> Imprimir Informe</button>`;
            
            document.getElementById('print-report-btn').addEventListener('click', () => {
                const finalReportHTML = reportWrapper.innerHTML;
                const printWindow = window.open('', '_blank');
                const headerHTML = `<header class="flex items-center gap-4 p-4 border-b mb-8"><img src="https://assets.poap.xyz/03beef3d-a544-40a6-ae2c-6b94b9cc3cc0.png" alt="Insignia La Movida de SST" class="h-16 w-16 rounded-full object-cover"><div><h2 class="text-2xl font-extrabold text-slate-800">La Movida de SST</h2><p class="text-sm text-slate-500">de la reaccion a la prevencion</p><a href="http://www.movidasst.com" target="_blank" class="text-xs text-cyan-600">www.movidasst.com</a></div></header>`;
                const footerHTML = `<footer class="mt-12 py-6 border-t border-slate-200 text-center text-xs text-slate-500 space-y-2"><p>El contenido (textos, gráficos, imágenes) está cubierto por <a rel="license" href="http://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" class="hover:text-cyan-600 font-semibold">CC BY-NC-SA 4.0</a>.</p><p>El código fuente de esta aplicación está cubierto por la <a href="https://opensource.org/licenses/MIT" target="_blank" class="hover:text-cyan-600 font-semibold">Licencia MIT</a>.</p><p class="pt-2">Autor: David Linares Brea | <a href="mailto:info@movidasst.com" class="text-cyan-600 hover:underline">info@movidasst.com</a></p></footer>`;
                printWindow.document.write(`<html><head><title>Informe de Investigación</title><script src="https://cdn.tailwindcss.com"><\/script><style>.prose { max-width: 80ch; } body {font-family: 'Inter', sans-serif;} .break-inside-avoid { page-break-inside: avoid; }</style></head><body class="p-8">${headerHTML}${finalReportHTML}${footerHTML}</body></html>`);
                printWindow.document.close();
                setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
            });
        });
    }

    function buildReportHTML() {
        const { general, persons, investigator, information, facts, diagram, measures, rootCauseSummary } = investigationState;

        const summaryHTML = rootCauseSummary 
            ? `<h3 class="text-xl font-semibold mt-4">Resumen del Análisis de Causas Raíz (IA)</h3><p class="bg-blue-50 p-3 border-l-4 border-blue-400 rounded-r-md">${rootCauseSummary}</p>`
            : '';

        return `<div class="prose max-w-none">
                <h1 class="text-3xl font-bold mb-4">Informe de Investigación de Accidente</h1>
                <section><h2 class="text-2xl font-semibold border-b pb-2 mb-4">1. Datos Generales</h2><div class="grid grid-cols-2 gap-4"><p><strong>Fecha:</strong> ${general.date || 'N/A'}</p><p><strong>Hora:</strong> ${general.time || 'N/A'}</p><p class="col-span-2"><strong>Lugar:</strong> ${general.location || 'N/A'}</p></div><h3 class="text-xl font-semibold mt-4">Descripción del Suceso</h3><p>${general.description || 'Sin descripción.'}</p><h3 class="text-xl font-semibold mt-4">Personas Involucradas</h3><table class="w-full text-left table-auto mt-2"><thead><tr class="bg-gray-200"><th class="p-2">Nombre</th><th class="p-2">Cargo</th><th class="p-2">Consecuencia</th></tr></thead><tbody>${persons.map(p => `<tr><td class="border p-2">${p.name}</td><td class="border p-2">${p.role}</td><td class="border p-2">${p.consequence}</td></tr>`).join('')}</tbody></table></section>
                <section class="mt-6"><h2 class="text-2xl font-semibold border-b pb-2 mb-4">2. Recopilación y Hechos</h2><h3 class="text-xl font-semibold">Información Recopilada</h3><pre class="bg-white p-3 border rounded font-sans whitespace-pre-wrap">${information || 'Sin información.'}</pre><h3 class="text-xl font-semibold mt-4">Listado de Hechos Constatados</h3><ol class="list-decimal pl-5">${facts.map(f => `<li>${f}</li>`).join('')}</ol></section>
                <section class="mt-6 break-inside-avoid">
                    <h2 class="text-2xl font-semibold border-b pb-2 mb-4">3. Árbol de Causas</h2>
                    ${summaryHTML}
                    <h3 class="text-xl font-semibold mt-6">Análisis Lógico</h3>${generateReportTreeHTML()}
                </section>
                <section class="mt-6 break-inside-avoid"><h2 class="text-2xl font-semibold border-b pb-2 mb-4">4. Medidas Propuestas</h2>${generateReportMeasuresHTML()}</section>
                <section class="mt-8 pt-8 border-t break-inside-avoid"><h2 class="text-2xl font-semibold border-b pb-2 mb-4">5. Datos del Investigador</h2><div class="grid grid-cols-2 gap-4"><p><strong>Nombre:</strong> ${investigator.name || 'N/A'}</p><p><strong>Cargo:</strong> ${investigator.role || 'N/A'}</p><p><strong>Fecha de Investigación:</strong> ${investigator.date || 'N/A'}</p></div><div class="mt-16 text-center"><div class="inline-block border-t-2 pt-2 px-12 border-gray-400"><p>Firma del Investigador</p></div></div></section>
            </div>`;
    }

    function generateReportTreeHTML() {
        const finalEvent = investigationState.diagram.nodes.find(n => n.finalEvent);
        if (!finalEvent) return '<p>No se ha definido un suceso final en el diagrama.</p>';
        function buildTree(nodeId) {
            const node = investigationState.diagram.nodes.find(n => n.id === nodeId);
            const childConnections = investigationState.diagram.connections.filter(c => c.to === nodeId);
            let html = `<li>${node.text}${node.isExternal ? ' <em>(Condición Externa)</em>' : ''}`;
            if (childConnections.length > 0) { html += '<ul>'; childConnections.forEach(conn => { html += buildTree(conn.from); }); html += '</ul>'; }
            html += '</li>';
            return html;
        }
        return `<ul>${buildTree(finalEvent.id)}</ul>`;
    }

    function generateReportMeasuresHTML() {
        const rootCauses = investigationState.diagram.nodes.filter(n => !n.isExternal && !investigationState.diagram.connections.some(c => c.to === n.id) && investigationState.diagram.connections.some(c => c.from === n.id));
        if(rootCauses.length === 0) return '<p>No se identificaron causas raíz gestionables o no se propusieron medidas.</p>';
        return `<table class="w-full text-left table-auto mt-2"><thead><tr class="bg-gray-200"><th class="p-2">Causa Raíz / Categoría</th><th class="p-2">Medida Correctiva</th><th class="p-2">Factor Potencial de Accidente (FPA)</th><th class="p-2">Medida Preventiva</th></tr></thead><tbody>
                ${rootCauses.map(cause => {
                    const m = investigationState.measures[cause.id] || { corrective: '', fpa: '', preventive: '', category: '' };
                    return `<tr><td class="border p-2"><p class="font-semibold">${cause.text}</p><p class="text-xs text-gray-600">${m.category || 'Sin categorizar'}</p></td><td class="border p-2">${m.corrective}</td><td class="border p-2">${m.fpa}</td><td class="border p-2">${m.preventive}</td></tr>`
                }).join('')}
                </tbody></table>`;
    }

    // --- CASO DE EJEMPLO ---
    function loadExampleCase() {
        const facts = ["Quemaduras de 2º y 3er grado en ambas piernas.", "El pantalón del operario se incendia.", "Operario intenta apagar el fuego con el pie.", "Se produce fuego en una lata con aceite.", "Pantalón del operario estaba impregnado de grasa.", "Compañeros no usan el extintor sobre la persona.", "Partículas incandescentes caen sobre la lata.", "La lata contenía aceite usado y restos de gasolina.", "Se realizaba un trabajo de desbarbado en las proximidades.", "El extintor se encontraba alejado del lugar del suceso.", "Se utilizó una lata contaminada con combustible.", "El personal desconocía si el agente extintor era tóxico para personas.", "No existía delimitación de zonas para trabajos en caliente.", "Falta de formación sobre el uso de extintores.", "Falta de formación sobre riesgos de líquidos inflamables."];
        
        const exampleState = {
            general: { date: '2025-10-06', time: '11:30', location: 'Taller de reparaciones "El Rápido"', description: 'Un operario sufre quemaduras graves en las piernas al incendiarse sus pantalones mientras intentaba apagar un fuego originado en una lata de aceite usado.' },
            persons: [{ name: 'Carlos Pérez', role: 'Mecánico', consequence: 'Quemaduras de 2º y 3er grado en ambas piernas.' }],
            investigator: { name: 'David Linares Brea', role: 'Jefe de Prevención', date: new Date().toISOString().split('T')[0] },
            information: `El día del accidente, el mecánico Carlos Pérez se encontraba realizando el cambio de aceite de un camión en el foso del taller. Al terminar de vaciar el aceite en una lata metálica, la apartó a un lado del foso. Simultáneamente, otro mecánico pulía una soldadura con una amoladora, generando chispas que alcanzaron la lata. La lata, que había contenido gasolina, se inflamó. Al ver el fuego, Carlos Pérez intentó apagarlo pisando la lata. Sus pantalones, impregnados de grasa, se prendieron fuego. Los compañeros no usaron el extintor por miedo a que fuera tóxico. El único extintor estaba lejos y el personal no tenía formación en su uso ni en manejo de inflamables. No había delimitación de zonas para trabajos en caliente.`,
            facts: facts,
            diagram: {
                nodes: [
                    { id: 'fact-0', text: facts[0], x: 700, y: 250, finalEvent: true, isExternal: false },
                    { id: 'fact-1', text: facts[1], x: 550, y: 250, finalEvent: false, isExternal: false },
                    { id: 'fact-2', text: facts[2], x: 400, y: 150, finalEvent: false, isExternal: false },
                    { id: 'fact-4', text: facts[4], x: 400, y: 350, finalEvent: false, isExternal: false },
                    { id: 'fact-3', text: facts[3], x: 250, y: 150, finalEvent: false, isExternal: false },
                    { id: 'fact-6', text: facts[6], x: 100, y: 80, finalEvent: false, isExternal: false },
                    { id: 'fact-7', text: facts[7], x: 100, y: 220, finalEvent: false, isExternal: false },
                    { id: 'fact-8', text: facts[8], x: -50, y: 20, finalEvent: false, isExternal: false },
                    { id: 'fact-10', text: facts[10], x: -50, y: 280, finalEvent: false, isExternal: false },
                    { id: 'fact-12', text: facts[12], x: -200, y: 20, finalEvent: false, isExternal: false },
                    { id: 'fact-14', text: facts[14], x: -200, y: 350, finalEvent: false, isExternal: false },
                    { id: 'fact-5', text: facts[5], x: 550, y: 450, finalEvent: false, isExternal: false },
                    { id: 'fact-11', text: facts[11], x: 400, y: 450, finalEvent: false, isExternal: false },
                    { id: 'fact-9', text: facts[9], x: 400, y: 550, finalEvent: false, isExternal: false },
                    { id: 'fact-13', text: facts[13], x: 250, y: 450, finalEvent: false, isExternal: false }
                ],
                connections: [
                    { from: 'fact-1', to: 'fact-0', type: 'chain' },
                    { from: 'fact-2', to: 'fact-1', type: 'chain' },
                    { from: 'fact-4', to: 'fact-1', type: 'conjunction' },
                    { from: 'fact-3', to: 'fact-2', type: 'chain' },
                    { from: 'fact-6', to: 'fact-3', type: 'chain' },
                    { from: 'fact-7', to: 'fact-3', type: 'conjunction' },
                    { from: 'fact-8', to: 'fact-6', type: 'chain' },
                    { from: 'fact-12', to: 'fact-8', type: 'chain' },
                    { from: 'fact-10', to: 'fact-7', type: 'chain' },
                    { from: 'fact-14', to: 'fact-10', type: 'chain' },
                    { from: 'fact-14', to: 'fact-4', type: 'chain' },
                    { from: 'fact-5', to: 'fact-0', type: 'conjunction' },
                    { from: 'fact-11', to: 'fact-5', type: 'chain' },
                    { from: 'fact-9', to: 'fact-5', type: 'conjunction' },
                    { from: 'fact-13', to: 'fact-11', type: 'chain' }
                ]
            },
            measures: {}
        };
        investigationState = exampleState;
        saveState();
        currentStep = 1;
        updateNav();
    }
    
    // --- CONTENIDO DE LA BASE DE CONOCIMIENTO ---
    function getKnowledgeBaseHTML() {
    return `<div class="prose max-w-none">
        <h2 class="text-3xl font-bold mb-4">Base de Conocimiento</h2>
        <p>Aquí encontrarás definiciones y consejos clave para aplicar correctamente el Método del Árbol de Causas.</p>
        
        <h3 class="text-2xl font-semibold mt-6 border-b pb-2 mb-4">Glosario de Términos Clave</h3>
        <dl class="space-y-4">
            <div>
                <dt class="font-bold text-lg text-slate-800">Hecho</dt>
                <dd class="ml-4 border-l-2 border-slate-200 pl-4">Una afirmación corta, objetiva, precisa e innegable sobre un suceso. No es una opinión ni un juicio de valor. Ejemplo: "El suelo estaba húmedo" en lugar de "El suelo estaba resbaladizo".</dd>
            </div>
            <div>
                <dt class="font-bold text-lg text-slate-800">Suceso Final</dt>
                <dd class="ml-4 border-l-2 border-slate-200 pl-4">Es el último hecho de la cadena de acontecimientos, usualmente la lesión o el daño material que motivó la investigación. Es el punto de partida del análisis hacia atrás.</dd>
            </div>
            <div>
                <dt class="font-bold text-lg text-slate-800">Condición Externa</dt>
                <dd class="ml-4 border-l-2 border-slate-200 pl-4">Un hecho que forma parte del entorno del accidente pero sobre el cual la organización no tiene control. Ejemplo: "Llovía intensamente", "Hubo un corte de suministro eléctrico en la ciudad". No son fallos del sistema.</dd>
            </div>
             <div>
                <dt class="font-bold text-lg text-slate-800">Causa Raíz</dt>
                <dd class="ml-4 border-l-2 border-slate-200 pl-4">Un hecho que está al origen de una o varias cadenas de acontecimientos y que, si se corrige, previene la recurrencia del suceso. Metodológicamente, es un hecho que tiene consecuencias (flechas que salen de él) pero ninguna causa que lo preceda en el diagrama (no le llegan flechas).</dd>
            </div>
            <div>
                <dt class="font-bold text-lg text-slate-800">Factor Potencial de Accidente (FPA)</dt>
                <dd class="ml-4 border-l-2 border-slate-200 pl-4">Es la generalización de una Causa Raíz a un problema sistémico de la organización. Permite pasar de una acción correctiva a una acción preventiva. Si la Causa Raíz fue "Falta de mantenimiento en la máquina X", el FPA podría ser "Programa de mantenimiento deficiente para todos los equipos críticos".</dd>
            </div>
        </dl>
        <h3 class="text-2xl font-semibold mt-8 border-b pb-2 mb-4">Consejos Metodológicos</h3>
        <ul class="list-disc pl-5 space-y-3 mt-4">
            <li><strong>Busca Hechos, no Culpables:</strong> El objetivo del método es entender fallos del sistema (procedimientos, organización, formación, equipos), no asignar culpas individuales.</li>
            <li><strong>Trabaja Siempre Hacia Atrás:</strong> Al construir el árbol, para cada hecho (efecto) pregúntate siempre: "¿Qué tuvo que ocurrir inmediatamente antes para que esto pasara?". Esa es su causa.</li>
            <li><strong>La Cadena Lógica:</strong> Una cadena causal debe tener sentido si se lee hacia adelante. "CAUSA -> por lo tanto -> EFECTO". Si no tiene lógica, la conexión es incorrecta.</li>
        </ul>
    </div>`;
}


    // --- CARGA INICIAL ---
    loadState();
});
</script>
</body>
</html>
