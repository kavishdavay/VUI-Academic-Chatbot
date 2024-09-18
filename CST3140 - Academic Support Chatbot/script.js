document.addEventListener('DOMContentLoaded', function() {

    // API Keys.
    const OPENAI_API_KEY = "API key";
    const GOOGLE_MAPS_API_KEY = "API key";

    // Chatbox elements.
    const chatInput = document.querySelector(".chat-input textarea");
    const sendButton = document.getElementById('send_btn');
    const chatArea = document.querySelector(".chat-area");

    // Microphone button elements.
    const speakButton = document.getElementById('speak_btn');
    const speakButtonWrapper = document.querySelector('.speak-btn-wrapper');
    const startSpeakSound = document.getElementById('startSpeakSound');
    const stopSpeakSound = document.getElementById('stopSpeakSound');

    let userMessage;

    let speakTimeout;
    let isSchedulingMeeting = false;

    // Array of available slots for scheduling events.
    let availableSlots = [
        { day: 'Monday', date: '2024-04-08', time: '10:00 AM' },
        { day: 'Wednesday', date: '2024-04-10', time: '2:00 PM' },
        { day: 'Friday', date: '2024-04-12', time: '1:00 PM' }
    ];

    // Array of objects to map intents to handler functions based on regex patterns for each intent.
    const intentMap = [
        { 
            pattern: /\b(guide|help|info|information)\b.*\b(on|about|for)?\s*(\w+ sensors?)\b/i, 
            handler: handleVideoGuide 
        },
        { 
            pattern: /\b(buy|find|purchase|where\s+can\s+i\s+find|store\s+sells)\b.*\b(robotics|sensor|module|arduino|esp32|micro\s+controller|components?)\b/i,
            handler: handleBuyComponents
        },
        {
            pattern: /\b(next|upcoming)\b.*\b(deadline)\b.*\b(for)?\s*(novel|AI|artificial intelligence)\b/i,
            handler: handleNextDeadline
        },
        {
            pattern: /\b(schedule|arrange)\b.*\b(meeting)\b/i,
            handler: handleScheduleMeeting
        },
        {
            pattern: /\b(show|view|get)\b.*\b(module)\s+(handbook|guide)\b.*\b(artificial intelligence|AI|novel interactions|novel)\b/i,
            handler: handleShowModuleHandbook
        },
        {
            pattern: /\b(help|support)\b/i, 
            handler: handleHelpRequest
        }
    ];

    // Array of recommended commands for suggestion panel.
    const recommendedCommands = [
        "When is my next deadline for novel? 📅",
        "Guide on ultrasonic sensors. 🤖",
        "What is ubiquitous computing? 🔍",
        "Show me the module handbook for artificial intelligence. 📕",
        "Where can I buy an Arduino? 🛒",
        "Schedule a meeting with my supervisor. 📅",
        "Why is data-preprocessing important? 🔍",
        "View module handbook for AI. 📕",
        "How to purchase a gas sensor? 🛒",
        "Guide on gas sensors. 🤖",
        "What is the travelling salesman problem? 🔍",
        "Show me the module handbook for novel interations. 📕",
        "Where can I purchase robotics components. 🛒",
    ];

    // Check if browser supports speech recognition.
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (typeof SpeechRecognition === "undefined") {
        alert("This browser does not support Web Speech API");
        return;
    }

    // Initialise speech recognition.
    let recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    // Call function when help button is clicked.
    let helpBtn = document.getElementById('help_btn');
    if (helpBtn) {
        helpBtn.addEventListener('click', function() {
            handleHelpRequest();
        });
    }

    // Listen for send button clicks and call function.
    sendButton.addEventListener('click', handleMessage);
    
    // Listen for enter key press and call function.
    chatInput.addEventListener('keypress', function(event) {
        if (event.key === "Enter") {
            event.preventDefault();
            handleMessage();
        }
    });


    /**
     * Fisher-Yates shuffle algorithm to shuffle array of commands.
     * 
     * @param {Array} array Array of suggested commands.
     */
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }


    /**
     * Displays the first three commands after shuffling in the suggestions panel.
     * Each command has a click listener for click to copy.
     * Dynamically replaces previous commands with new ones.
     */
    function displayCommands() {
        shuffleArray(recommendedCommands);
        const commandsToShow = recommendedCommands.slice(0, 3);

        const commandsHtml = commandsToShow.map((command, index) => 
            `<p class="clickable-command" id="command-${index}">${command}</p>`
        ).join('');
        const commandsContainer = document.querySelector(".suggestion-panel .commands-container");
        commandsContainer.innerHTML = commandsHtml;

        commandsToShow.forEach((_, index) => {
            document.getElementById(`command-${index}`).addEventListener('click', function() {
                let commandText = this.innerText.replace(/[\u{1F600}-\u{1F64F}]/gu, "").trim();
                chatInput.value = commandText;
                chatInput.focus();
            });
        });

        commandsContainer.classList.remove("animate-commands");
        setTimeout(() => {
            commandsContainer.classList.add("animate-commands");
        }, 50);
    }

    displayCommands();
    setInterval(displayCommands, 10000);    // Refresh commands every 10 seconds.


    /* Initialise and display calendar with pre-defined deadline dates. */
    var calendarElement = document.getElementById('calendar');
    var calendar = new FullCalendar.Calendar(calendarElement, {
      initialView: 'dayGridMonth',
      events: [
        {
          title: 'Novel CW2 Deadline',
          start: '2024-04-03',
          color: '#ff9f89',
          textColor: '#000000',
        },
        {
          title: 'AI Deadline',
          start: '2024-04-11',
          color: '#ff9f89',
          textColor: '#000000',
        }
      ],
      eventDidMount: function(info) {
        var tooltip = info.event.title;
        info.el.setAttribute('title', tooltip);
      }
    });
    calendar.render();


    /* 
        Toggle speech recognition and animation status on click.
        When already listening stop recognition and animation on click. 
    */
    speakButton.addEventListener('click', function() {
        clearTimeout(speakTimeout);

        if (!speakButtonWrapper.classList.contains('pulsing')) {
            window.speechSynthesis.cancel();
            speakButtonWrapper.classList.add('pulsing');
            startSpeakSound.play();
            recognition.start();
            
        } else {
            recognition.stop();
            speakButtonWrapper.classList.remove('pulsing');
            stopSpeakSound.play();
        }
    });

    /* Handle result of speech recognition. */
    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        const capitalisedTranscript = capitaliseFirstLetter(transcript);
        chatInput.value = capitalisedTranscript;
        handleMessage();
    };

    /* Handle errors during speech recognition. */
    recognition.onerror = function(event) {
        window.speechSynthesis.cancel();
        let errorMessage = "Speech Recognition Error: " + event.error;
        const utterance = new SpeechSynthesisUtterance(errorMessage);
        window.speechSynthesis.speak(utterance);
    };

    /* Automatically play stop sound and stop mic button animation when speech recognition ends. */
    recognition.onend = function() {
        speakButtonWrapper.classList.remove('pulsing');
        stopSpeakSound.play();
        clearTimeout(speakTimeout);
    };


    /**
     * Processes a string to speech using the speech synthesis.
     * @param {String} text The response that needs to be converted to speech.
     */
    function speakMessage(text) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();

            // Remove unwanted symbols and characters from voice response.
            const cleanText = text
                .replace(/https?:\/\/\S+/gi, ' ')
                .replace(/<br\s*\/?>/gi, ', ')
                .replace(/<a href=".*?">.*?<\/a>/gi, "")
                .replace(/<[^>]+>/gi, "")
                .replace(/&nbsp;/gi, " ")
                .replace(/&bull;/gi, "");
            
            /* Initialise speech synthesizer. */
            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance.lang = 'en-US';
            utterance.pitch = 1;
            utterance.rate = 1;
            
            window.speechSynthesis.speak(utterance);
            
            /* Refresh speech synthesizer every 14 seconds for longer responses. */
            let r = setInterval(() => {
                if (!speechSynthesis.speaking) {
                    clearInterval(r);
                } else {
                    speechSynthesis.pause();
                    speechSynthesis.resume();
                }
            }, 14000);
              
        } else {
            console.error("Speech Synthesis not supported in this browser.");
        }
    }


    /**
     * Constructs and returns a chat list element to be added to the chatlog.
     * 
     * @param {String} message Text of response.
     * @param {String} className Either system or user.
     * @param {Boolean} speak Flag for speech synthesis.
     * @param {String|null} embed Optional embedded content.
     * @returns HTML List element
     */
    function addChatMessage(message, className, speak = true, embed = null) {
        const chatLi = document.createElement("li");
        chatLi.classList.add("chat", className);
    
        const messageContainer = document.createElement("div");
        messageContainer.classList.add("message");
    
        const messageParagraph = document.createElement("p");
        messageParagraph.innerHTML = message;
        messageContainer.appendChild(messageParagraph);
    
        // Add embedded content if present.
        if (embed) {
            messageParagraph.classList.add("has-embed");
            messageContainer.classList.add("has-embed");
            const embedElement = document.createElement("div");
            embedElement.innerHTML = embed;
            embedElement.classList.add("embed-content");
            messageContainer.appendChild(embedElement);
            console.log("successful");
        }
        
        if (className === "system") {
            const iconSpan = document.createElement("span");
            iconSpan.classList.add("material-symbols-outlined");
            iconSpan.innerText = "smart_toy";
            chatLi.appendChild(iconSpan);
            
            if (speak) {
                speakMessage(message);
            }
        }
    
        chatLi.appendChild(messageContainer);
        return chatLi;
    }


    /**
     * Passes user commands to a function for processing and adds them to the chatlog.
     * 
     * @returns void
     */
    function handleMessage() {
        userMessage = chatInput.value.trim();
        
        if (!userMessage) return;

        /* Add user message to the chatlog. */
        const capitalisedUserMessage = capitaliseFirstLetter(userMessage);
        chatArea.appendChild(addChatMessage(capitalisedUserMessage, "user"));

        processCommand(capitalisedUserMessage); // Pass user command to function for processing.

        chatInput.value = '';   // Clear chat input.
        chatArea.scrollTop = chatArea.scrollHeight; // Automatically scroll to bottom of chatlog.
    }


    /**
     * Detects the intents of user commands using the array of regular expressions to match intents.
     * Calls handler functions based on the intent detected.
     * Handles cases where an intent cannot be found by either providing an error message
     * when specific keywords are found, otherwise it attempts to fetch a response using openAI.
     * 
     * @param {String} inputText User command.
     * @returns void
     */
    function processCommand(inputText) {

        if (isSchedulingMeeting && /\b(cancel|never mind|stop|exit)\b/i.test(inputText)) {
            handleCancel();
            return;
        }

        if (isSchedulingMeeting) {

            let match = inputText.match(/\bslot\s+(\d+)/i);
            let selection = match ? parseInt(match[1]) - 1 : parseInt(inputText) - 1;

            if (selection >= 0 && selection < availableSlots.length) {
                const slot = availableSlots[selection];
                chatArea.appendChild(addChatMessage(`Meeting scheduled on ${slot.day}, ${slot.date} at ${slot.time}.<br>Please let me know if there's anything else I can help with!`, "system"));
                addMeetingToCalendar(slot);
                isSchedulingMeeting = false;
            } else {
                chatArea.appendChild(addChatMessage("Invalid selection. Please select a valid slot or cancel the request by saying 'cancel'.", "system"));
            }
            return;

        }
    
        let intentFound = false;
    
        // Attempt to match the user input against known commands.
        for (const intent of intentMap) {
            const match = intent.pattern.exec(inputText);
            if (match) {
                intent.handler(match); // Call the handler with the match.
                intentFound = true;
                break;
            }
        }
    
        // If a known command is not found, check for specific keywords.
        if (!intentFound) {
            const specificKeywords = ['contact', 'deadline', 'module', 'handbook', 'buy', 'purchase', 'schedule', 'lecturer', 'supervisor'];
            const containsSpecificKeyword = specificKeywords.some(keyword => inputText.toLowerCase().includes(keyword));
    
            if (containsSpecificKeyword) {
                // Respond with error message when input contains specific keywords but doesn't match any known commands.
                chatArea.appendChild(addChatMessage("Sorry, I cannot provide assistance with that request. Say 'Help' or click on the help icon for a list of accepted commands.", "system"));
            } else {
                // No specific keywords found, so use OpenAI to generate a general response.
                generateResponse(inputText);
            }
        }
    }


    /**
     * Fetches a response for a user command using openAI gpt-3.5-turbo.
     * 
     * @param {String} userQuery User command.
     */
    function generateResponse(userQuery) {
        const API_URL = "https://api.openai.com/v1/chat/completions";
        const modifiedUserQuery = `write a concise reply for: ${userQuery}`;
        
        // Display a "thinking" message when fetching response.
        const thinkingMessageLi = addChatMessage("Thinking...", "system", false);
        chatArea.appendChild(thinkingMessageLi);
    
        // Define properties for API request.
        const requestOptions = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [{role: "user", content: modifiedUserQuery}],
            })
        };
    
        // Send POST request to API.
        fetch(API_URL, requestOptions)
            .then(res => res.json())
            .then(data => {
                const responseMessage = data.choices[0].message.content.trim();
                
                // Replace the "thinking" message with the actual response.
                chatArea.replaceChild(addChatMessage(responseMessage, "system"), thinkingMessageLi);
            })
            .catch(() => {
                // On error, replace the "thinking" message with an error message.
                chatArea.replaceChild(addChatMessage("Something went wrong. Please try again.", "system"), thinkingMessageLi);
            })
            .finally(() => {
                chatArea.scrollTop = chatArea.scrollHeight;
            });
    }


    /**
     * Handler function for 'video guide' intent.
     * Extracts and processes slots to determine appropriate responses.
     * 
     * @param {Array} match Result of the regex pattern match.
     */
    function handleVideoGuide(match) {
        // The third group in the match array contains the sensor type.
        const sensorType = match[3];
        
        if (sensorType.toLowerCase().includes("ultrasonic")) {
            displayVideoGuide("ultrasonic");
        } else if (sensorType.toLowerCase().includes("gas")) {
            displayVideoGuide("gas");
        } else {
            chatArea.appendChild(addChatMessage(`Sorry I don't have a guide on ${sensorType}.`, "system"));
        }
    }


    /**
     * Handler function for 'show module handbook' intent.
     * Extracts and processes slots to determine appropriate responses.
     * 
     * @param {Array} match Result of the regex pattern match.
     */
    function handleShowModuleHandbook(match) {
        // The fourth group in the match array contains the module name.
        const moduleName = match[4];
        
        switch (moduleName.toLowerCase()) {
            case 'artificial intelligence':
            case 'ai':
                showModuleHandbook('Artificial Intelligence');
                break;
            case 'novel interactions':
            case 'novel':
                showModuleHandbook('Novel Interactions');
                break;
            default:
                // Handle unrecognized module names.
                chatArea.appendChild(addChatMessage(`Sorry, I don't have information on the ${moduleName} module.`, "system"));
        }
    }


    /**
     * Handler function for 'buy components' intent.
     * Uses geolocation to get longitude and latitude of user's location.
     */
    function handleBuyComponents() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(position) {
                
                /* User's current location coordinates */
                const userLatitude = position.coords.latitude;
                const userLongitude = position.coords.longitude;

                displayMapWithDirections(userLatitude, userLongitude);

            }, function() {
                // User denied location access or an error occurred.
                displayMapWithMarker();
            });
        } else {
            // Geolocation is not supported by browser.
            displayMapWithMarker();
        }
    }
    

    /**
     * Handler for 'schedule meeting' intent.
     * Constructs response with available slots from array,
     * and adds it to the chatlog.
     */
    function handleScheduleMeeting() {
        isSchedulingMeeting = true;
        let message = "Please select a slot for your meeting:<br><br>";
        availableSlots.forEach((slot, index) => {
            message += `Slot ${index + 1} - ${slot.day}, ${slot.date} at ${slot.time}<br>`;
        });
        chatArea.appendChild(addChatMessage(message, "system"));
    }


    /**
     * Handler for 'cancel' intent.
     * Used to terminate the scheduling process.
     */
    function handleCancel() {
        if (isSchedulingMeeting) {
            chatArea.appendChild(addChatMessage("Scheduling process canceled.<br>Is there anything else you need help with?", "system"));
            isSchedulingMeeting = false;
        } else {
            chatArea.appendChild(addChatMessage("No active process to cancel.", "system"));
        }
    }


    /**
     * Handler for 'next deadline' intent.
     * Extracts and processes slots to determine appropriate responses.
     * 
     * @param {Array} match Result of the regex pattern match.
     * @returns void
     */
    function handleNextDeadline(match) {
        // The fourth group in the match array contains the module name.
        let moduleName = match[4].toLowerCase();

        if (moduleName === 'artificial intelligence') {
            moduleName = 'ai';
        }
        
        const knownModules = ['novel', 'ai'];
    
        // Check if the module name is recognized.
        if (!knownModules.includes(moduleName)) {
            // Module not recognized.
            chatArea.appendChild(addChatMessage(`I couldn't find the next deadline for ${match[4]}. Please try another module name.`, "system"));
            return;
        }
    
        const currentDate = new Date();
        let closestDeadline = null;
    
        /* Filter events for the specified module and find the closest future deadline. */
        calendar.getEvents().forEach(event => {
            const eventDate = new Date(event.start);
            if (event.title.toLowerCase().includes(moduleName) && eventDate >= currentDate) {
                if (!closestDeadline || eventDate < new Date(closestDeadline.start)) {
                    closestDeadline = event;
                }
            }
        });
    
        if (closestDeadline) {
            const formattedDate = closestDeadline.start.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            chatArea.appendChild(addChatMessage(`The next deadline for ${moduleName.toUpperCase()} is on ${formattedDate}.`, "system"));
        } else {
            chatArea.appendChild(addChatMessage(`I couldn't find the next deadline for ${moduleName.toUpperCase()}.`, "system"));
        }
    }


    /**
     * Handler function for 'help' intent.
     * Adds the documentation help to the chat log.
     */
    function handleHelpRequest() {
        const message = `<p>Welcome to the Academic Support System for Computer Science and Software Engineering (CSSE) Students!<br><br>
        This system is designed to be your virtual assistant, providing quick and easy access to a variety of academic resources and information to support your studies in Computer Science and Software Engineering. Whether you need help finding resources, scheduling appointments, or just getting answers to common questions, this system is here to assist you.<br><br>
        <b>Here's what I can do for you:</b><br><br>
        - <b>Find Guides and Information</b>: Need details or tutorials on specific topics? Just ask! For example:<br>
          &nbsp;&nbsp;&bull; "Guide on ultrasonic sensors."<br>
          &nbsp;&nbsp;&bull; "What is ubiquitous computing?"<br><br>
        - <b>Module Handbooks</b>: Looking for your course module handbooks? I can help you view them directly. Try saying:<br>
          &nbsp;&nbsp;&bull; "Show me the module handbook for artificial intelligence."<br>
          &nbsp;&nbsp;&bull; "View module handbook for AI."<br><br>
        - <b>Purchase Components</b>: Working on a project and need to buy components? I can direct you to where you can find them. For instance:<br>
          &nbsp;&nbsp;&bull; "Where can I buy an Arduino?"<br>
          &nbsp;&nbsp;&bull; "How to purchase a gas sensor?"<br><br>
        - <b>Scheduling and Deadlines</b>: Keep track of your deadlines and schedule meetings without hassle. For example:<br>
          &nbsp;&nbsp;&bull; "When is my next deadline for novel?"<br>
          &nbsp;&nbsp;&bull; "Schedule a meeting with my supervisor."<br><br>
        - <b>And More</b>: I'm equipped to assist with a wide range of queries related to your academic life.<br><br>
        <b>How to Use the System</b>:<br><br>
        Simply type your question or command in the chat, or if you're using voice input, just speak clearly into your microphone. Here are some example commands to get you started:<br><br>
        - "Guide on gas sensors."<br>
        - "What is the traveling salesman problem?"<br>
        - "Show me the module handbook for novel interactions."<br>
        - "Where can I purchase robotics components?"<br><br>
        Remember, I'm here to make your academic journey a bit easier. Don't hesitate to ask for help!</p>`

        chatArea.appendChild(addChatMessage(message, "system", true));
        chatArea.scrollTop = chatArea.scrollHeight;
        
    }


    /**
     * Uses Google Maps API to generate a map with directions to a location.
     * Constructs response with embedding and adds it to the chatlog.
     * 
     * @param {Number} userLatitude Latitude coordinate of current location.
     * @param {Number} userLongitude Longitude coordinate of current location.
     */
    function displayMapWithDirections(userLatitude, userLongitude) {

        const message = `Transcom electronics located in Rose-Hill holds a comprehensive inventory of 
        electronic components for robotics including; sensors, modules, micro-processors, 
        actuators, and much more. I have provided the directions to Transcom from your current location.`;
        
        const embed = `
            <div class="embed-container">
                <div class="iframe-container">
                    <iframe src="https://www.google.com/maps/embed/v1/directions?key=${GOOGLE_MAPS_API_KEY}&origin=${userLatitude},${userLongitude}&destination=place_id:ChIJ4SkxgydbfCEREMKzA-h4YXA" allowfullscreen></iframe>
                </div>
            </div>`;

        chatArea.appendChild(addChatMessage(message, "system", true, embed));
        chatArea.scrollTop = chatArea.scrollHeight;
    }


    /**
     * Uses Google Maps API to generate a map with a marker on a location.
     * Constructs response with embedding and adds it to the chatlog.
     */
    function displayMapWithMarker() {
        
        const message = `Transcom electronics located in Rose-Hill holds a comprehensive inventory of 
        electronic components for robotics including; sensors, modules, micro-processors, 
        actuators, and much more.`;
        const embed = `
        <div class="embed-container">
            <div class="iframe-container">
            <iframe src="https://www.google.com/maps/embed/v1/search?q=Transcom,+Saint+Ignace+Street,+Beau+Bassin-Rose+Hill,+Mauritius&key=${GOOGLE_MAPS_API_KEY}" allowfullscreen>></iframe>
            </div>
        </div>`;
        chatArea.appendChild(addChatMessage(message, "system", true, embed));
        chatArea.scrollTop = chatArea.scrollHeight;
    }


    /**
     * Constructs a response with embedded Youtube videos based on the slot passed.
     * 
     * @param {String} sensorType The slot for the intent.
     */
    function displayVideoGuide(sensorType) {

        const message = `Here's a comprehensive guide on ${sensorType} sensors.`;
        let embed;

        if (sensorType === 'ultrasonic') {

            embed = `
            <div class="embed-container">
                <div class="iframe-container">
                <iframe src="https://www.youtube.com/embed/QOc4vgqFXS0?si=InyIoIuug9rz3mJt" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
                </div>
            </div>`;

        } else if (sensorType === 'gas') {

            embed = `
            <div class="embed-container">
                <div class="iframe-container">
                <iframe src="https://www.youtube.com/embed/cmL7QgTNv7M?si=vqhxgohJyYV2R6j7" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
                </div>
            </div>`;

        }

        chatArea.appendChild(addChatMessage(message, "system", true, embed));
    }


    /**
     * Adds an event using FUllCalendar library based on the slot selected when scheduling meetings.
     * 
     * @param {Object} slot Object representing the selected time slot for the meeting.
     */
    function addMeetingToCalendar(slot) {
        calendar.addEvent({
            title: 'Meeting with Supervisor',
            start: `${slot.date}T${formatTime(slot.time)}`,
            allDay: false,
            color: '#3788d8'
        });
        calendar.render();
    }


    /**
     * Handler for 'show module handbook' intent.
     * Constructs responses with clickable URL links based on the slot passed.
     * 
     * @param {String} moduleName Name of the module.
     */
    function showModuleHandbook(moduleName) {
        let message;
        let link;
    
        if (moduleName.toLowerCase() === 'artificial intelligence') {

            link = "https://mdx.mrooms.net/mod/resource/view.php?id=2776864";
            message = `Here's the handbook for the ${moduleName} module: <br><br><a href="${link}" target="_blank">${link}</a>`;

        } else if (moduleName.toLowerCase() === 'novel interactions') {

            link = "https://mdx.mrooms.net/pluginfile.php/3726939/mod_resource/content/12/CST3140-Handbook.pdf";
            message = `Here's the handbook for the ${moduleName} module: <br><br><a href="${link}" target="_blank">${link}</a>`;

        } else {

            message = `Sorry, I don't have a handbook link for the ${moduleName} module.`;
        }
    
        chatArea.appendChild(addChatMessage(message, "system", true));
    }
});


/**
 * Helper function to capitalise the first word in a sentence.
 * 
 * @param {String} string Text to be capitalised.
 * @returns {String} Capitalised text.
 */
function capitaliseFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}


/**
 * Converts time to 24H format.
 * 
 * @param {String} timeStr The time in 12-hour format.
 * @returns {String} The time converted to 24-hour format
 */
function formatTime(timeStr) {
    let [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':');
    if (hours === '12') {
        hours = '00';
    }
    if (modifier === 'PM') {
        hours = parseInt(hours, 10) + 12;
    }
    return `${hours}:${minutes}`;
}