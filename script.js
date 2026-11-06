const API = 'https://api.enem.dev/v1';
const $ = selector => document.querySelector(selector);
const PAGE_SIZE = 10;
const FETCH_SIZE = 50;
const subjects = {
  linguagens: 'Linguagens',
  'ciencias-humanas': 'Ciências Humanas',
  'ciencias-natureza': 'Ciências da Natureza',
  matematica: 'Matemática'
};

const menuToggle = $('#menuToggle');
const nav = $('#nav');

function closeMenu() {
  if (!nav || !menuToggle) return;

  nav.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Abrir menu');
}

if (menuToggle && nav) {
  menuToggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');

    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute(
      'aria-label',
      open ? 'Fechar menu' : 'Abrir menu'
    );
  });
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeMenu();
});

document.addEventListener('click', event => {
  if (!event.target.closest('.header')) closeMenu();
});

document.querySelectorAll('.brand-logo').forEach(image => {
  function hideMissingLogo() {
    image.hidden = true;
  }

  image.addEventListener('error', hideMissingLogo);

  if (image.complete && image.naturalWidth === 0) {
    hideMissingLogo();
  }
});

let requestQueue = Promise.resolve();
let lastRequest = 0;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function apiGet(path, isCurrent = () => true) {
  const task = requestQueue.then(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!isCurrent()) return null;

      const delay = Math.max(
        0,
        1100 - (Date.now() - lastRequest)
      );

      if (delay) await wait(delay);

      if (!isCurrent()) return null;

      lastRequest = Date.now();

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        25000
      );

      let response;

      try {
        response = await fetch(`${API}${path}`, {
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!isCurrent()) return null;

      if (response.status === 429 && attempt < 2) {
        const retry = response.headers.get('Retry-After');
        let delayMs = 2500 * (attempt + 1);

        if (retry) {
          const seconds = Number(retry);

          if (Number.isFinite(seconds)) {
            delayMs = Math.max(1100, seconds * 1000);
          } else {
            const date = Date.parse(retry);

            if (Number.isFinite(date)) {
              delayMs = Math.max(
                1100,
                date - Date.now()
              );
            }
          }
        }

        await wait(delayMs);
        continue;
      }

      if (!response.ok) {
        throw new Error(
          `A API respondeu com erro ${response.status}.`
        );
      }

      return response.json();
    }
  });

  requestQueue = task.catch(() => {});

  return task;
}

function extractList(data, keys) {
  if (Array.isArray(data)) return data;

  for (const key of keys) {
    if (Array.isArray(data?.[key])) {
      return data[key];
    }
  }

  if (Array.isArray(data?.data)) {
    return data.data;
  }

  return [];
}

function el(tag, className, content) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (content !== undefined && content !== null) {
    element.textContent = String(content);
  }

  return element;
}

function safeImageUrl(value) {
  if (typeof value !== 'string') return null;

  try {
    const url = new URL(value);

    return url.protocol === 'https:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function appendImage(
  parent,
  value,
  alt = 'Imagem da questão'
) {
  const url = safeImageUrl(value);

  if (!url) return;

  const image = el('img', 'question-image');

  image.src = url;
  image.alt = alt;
  image.loading = 'lazy';

  parent.append(image);
}

function appendRichText(
  parent,
  value,
  className = ''
) {
  const usedImages = new Set();

  if (!value) return usedImages;

  const text = String(value);
  const pattern = /!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)/g;

  let position = 0;

  function appendTextPart(part) {
    if (!part.trim()) return;

    const block = el(
      'span',
      `rich-text ${className}`.trim()
    );

    const boldPattern = /\*\*([\s\S]+?)\*\*/g;

    let start = 0;

    for (const match of part.matchAll(boldPattern)) {
      block.append(
        document.createTextNode(
          part.slice(start, match.index)
        )
      );

      block.append(
        el('strong', '', match[1])
      );

      start = match.index + match[0].length;
    }

    block.append(
      document.createTextNode(part.slice(start))
    );

    parent.append(block);
  }

  for (const match of text.matchAll(pattern)) {
    appendTextPart(
      text.slice(position, match.index)
    );

    const url = safeImageUrl(match[2]);

    if (url) {
      appendImage(
        parent,
        url,
        match[1] || 'Imagem da questão'
      );

      usedImages.add(url);
    }

    position = match.index + match[0].length;
  }

  appendTextPart(text.slice(position));

  return usedImages;
}

function makeQuestion(question) {
  const card = el('article', 'question-card');
  const top = el('div', 'question-top');

  top.append(
    el(
      'span',
      'pill',
      subjects[question.discipline] ?? 'ENEM'
    ),
    el(
      'span',
      'question-num',
      `ENEM ${question.year} • Questão ${question.index}`
    )
  );

  card.append(
    top,
    el(
      'h3',
      '',
      question.title ?? `Questão ${question.index}`
    )
  );

  const context = el('div', 'question-content');

  const usedImages = appendRichText(
    context,
    question.context
  );

  const command = el('div', 'question-content');

  const commandImages = appendRichText(
    command,
    question.alternativesIntroduction,
    'question-command'
  );

  for (const url of commandImages) {
    usedImages.add(url);
  }

  card.append(context);

  const files = Array.isArray(question.files)
    ? question.files
    : [];

  files.forEach(file => {
    const url = safeImageUrl(file);

    if (url && !usedImages.has(url)) {
      appendImage(card, url);
      usedImages.add(url);
    }
  });

  card.append(command);

  const alternatives = Array.isArray(question.alternatives)
    ? question.alternatives
    : [];

  if (!alternatives.length) {
    card.append(
      el(
        'p',
        'status',
        'Alternativas indisponíveis nesta questão.'
      )
    );

    return card;
  }

  const group = el('div', 'alternatives');
  const feedback = el('div', 'answer-feedback');

  group.setAttribute('role', 'group');
  group.setAttribute(
    'aria-label',
    'Alternativas da questão'
  );

  feedback.setAttribute('role', 'status');

  alternatives.forEach((alternative, index) => {
    const letter = alternative.letter
      ?? String.fromCharCode(65 + index);

    const button = el('button', 'alternative');
    const body = el('span', 'alternative-body');

    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');

    const images = appendRichText(
      body,
      alternative.text
    );

    const file = safeImageUrl(alternative.file);

    if (file && !images.has(file)) {
      appendImage(
        body,
        file,
        `Imagem da alternativa ${letter}`
      );
    }

    button.append(
      el('span', 'alternative-letter', letter),
      body
    );

    button.addEventListener('click', () => {
      group.querySelectorAll('button').forEach(item => {
        item.classList.remove(
          'selected',
          'correct',
          'incorrect'
        );

        item.setAttribute('aria-pressed', 'false');
      });

      button.classList.add('selected');
      button.setAttribute('aria-pressed', 'true');

      const correct = question.correctAlternative
        ?? alternatives.find(item => item.isCorrect)?.letter;

      feedback.className = 'answer-feedback';

      if (!correct) {
        feedback.textContent =
          'Alternativa selecionada. O gabarito não está disponível.';

        return;
      }

      const isCorrect = String(correct).toUpperCase()
        === String(letter).toUpperCase();

      button.classList.add(
        isCorrect ? 'correct' : 'incorrect'
      );

      feedback.classList.add(
        isCorrect ? 'success' : 'error'
      );

      feedback.textContent = isCorrect
        ? '✓ Resposta correta! Continue assim.'
        : `Resposta incorreta. Gabarito: alternativa ${correct}.`;
    });

    group.append(button);
  });

  card.append(group, feedback);

  return card;
}

async function getYears() {
  const data = await apiGet('/exams');

  const exams = extractList(
    data,
    ['exams', 'results', 'items']
  );

  return [...new Set(
    exams
      .map(exam => Number(
        typeof exam === 'object'
          ? exam.year
          : exam
      ))
      .filter(year => {
        return Number.isInteger(year) && year >= 1998;
      })
  )].sort((a, b) => b - a);
}

function hasNextPage(
  data,
  count,
  offset,
  limit
) {
  const metadata = data?.metadata;

  if (!count) return false;

  if (typeof metadata?.hasMore === 'boolean') {
    return metadata.hasMore;
  }

  if (Number.isFinite(metadata?.total)) {
    return offset + count < metadata.total;
  }

  return count === limit;
}

function errorMessage(error) {
  if (error.name === 'AbortError') {
    return 'A API demorou para responder. Tente novamente.';
  }

  return error.message
    || 'Não foi possível concluir a busca.';
}

function scrollToPractice() {
  const reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  $('#practiceSection').scrollIntoView({
    behavior: reducedMotion ? 'auto' : 'smooth'
  });
}

function setupExams() {
  const grid = $('#examsGrid');
  const status = $('#examsStatus');
  const list = $('#questionsList');
  const questionStatus = $('#questionsStatus');
  const more = $('#moreQuestions');

  let activeSession = null;

  async function loadExams() {
    $('#reloadExams').disabled = true;
    status.textContent = 'Carregando provas...';
    grid.replaceChildren();

    try {
      const years = await getYears();

      years.forEach(year => {
        const card = el('article', 'exam-card');
        const button = el(
          'button',
          '',
          'Ver questões ↗'
        );

        button.type = 'button';

        button.setAttribute(
          'aria-label',
          `Ver questões do ENEM ${year}`
        );

        button.addEventListener('click', () => {
          const session = {
            year,
            offset: 0,
            busy: false
          };

          activeSession = session;

          list.replaceChildren();
          more.hidden = true;

          $('#practiceTitle').textContent =
            `ENEM ${year}`;

          $('#questionCount').textContent =
            'Carregando questões...';

          $('#practiceSection').hidden = false;

          scrollToPractice();
          loadQuestions(session);
        });

        card.append(
          el('p', 'exam-label', 'ENEM'),
          el('h3', '', year),
          button
        );

        grid.append(card);
      });

      status.textContent = years.length
        ? ''
        : 'Nenhuma prova disponível no momento.';
    } catch (error) {
      status.textContent = errorMessage(error);
    } finally {
      $('#reloadExams').disabled = false;
    }
  }

  async function loadQuestions(session) {
    if (session !== activeSession || session.busy) {
      return;
    }

    session.busy = true;
    more.disabled = true;

    questionStatus.textContent =
      'Carregando questões...';

    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(session.offset)
      });

      const data = await apiGet(
        `/exams/${session.year}/questions?${params}`,
        () => session === activeSession
      );

      if (session !== activeSession) return;

      const questions = extractList(
        data,
        ['questions', 'results', 'items']
      );

      questions.forEach(question => {
        list.append(
          makeQuestion({
            ...question,
            year: session.year
          })
        );
      });

      const hasMore = hasNextPage(
        data,
        questions.length,
        session.offset,
        PAGE_SIZE
      );

      session.offset += questions.length;

      $('#questionCount').textContent =
        `${session.offset} questões carregadas • ENEM ${session.year}`;

      more.hidden = !hasMore;

      questionStatus.textContent = questions.length
        ? ''
        : 'Não há mais questões disponíveis para esta prova.';
    } catch (error) {
      if (session !== activeSession) return;

      questionStatus.textContent = errorMessage(error);
      more.hidden = false;
    } finally {
      session.busy = false;

      if (session === activeSession) {
        more.disabled = false;
      }
    }
  }

  more.addEventListener('click', () => {
    if (activeSession) {
      loadQuestions(activeSession);
    }
  });

  $('#reloadExams').addEventListener(
    'click',
    loadExams
  );

  loadExams();
}

function setupSubjects() {
  const cards = [
    ...document.querySelectorAll('[data-subject]')
  ];

  const list = $('#questionsList');
  const status = $('#questionsStatus');
  const more = $('#moreQuestions');

  let yearsPromise = null;
  let activeSession = null;

  function loadYears() {
    if (!yearsPromise) {
      yearsPromise = getYears().catch(error => {
        yearsPromise = null;
        throw error;
      });
    }

    return yearsPromise;
  }

  cards.forEach(card => {
    card.addEventListener('click', async () => {
      const subject = card.dataset.subject;

      const session = {
        subject,
        streams: [],
        cursor: 0,
        count: 0,
        busy: false,
        seen: new Set()
      };

      activeSession = session;

      cards.forEach(item => {
        const selected = item === card;

        item.classList.toggle('selected', selected);
        item.setAttribute(
          'aria-pressed',
          String(selected)
        );
      });

      list.replaceChildren();

      $('#subjectsStatus').textContent = '';
      $('#practiceSection').hidden = false;

      $('#practiceTitle').textContent =
        subjects[subject];

      $('#questionCount').textContent =
        'Preparando sua seleção...';

      more.hidden = true;
      more.disabled = true;

      status.textContent =
        'Consultando os anos disponíveis...';

      scrollToPractice();

      try {
        const years = await loadYears();

        if (activeSession !== session) return;

        if (!years.length) {
          status.textContent =
            'Nenhum ano disponível no momento.';

          return;
        }

        session.streams = years.map(year => ({
          year,
          offset: 0,
          done: false,
          buffer: []
        }));

        await loadMixedQuestions(session);
      } catch (error) {
        if (activeSession !== session) return;

        status.textContent = errorMessage(error);

        $('#subjectsStatus').textContent =
          'Clique na área novamente para tentar outra vez.';
      }
    });
  });

  function nextStream(session) {
    const total = session.streams.length;

    for (let i = 0; i < total; i++) {
      const index = (session.cursor + i) % total;
      const stream = session.streams[index];

      if (stream.buffer.length > 0 || !stream.done) {
        session.cursor = (index + 1) % total;
        return stream;
      }
    }

    return null;
  }

  function displayBatch(session, batch) {
    batch.forEach(question => {
      list.append(makeQuestion(question));
    });

    session.count += batch.length;

    $('#questionCount').textContent =
      `${session.count} questões carregadas • ` +
      `${subjects[session.subject]} • anos variados`;
  }

  async function loadMixedQuestions(session) {
    if (session !== activeSession || session.busy) {
      return;
    }

    session.busy = true;
    more.disabled = true;
    status.textContent = 'Buscando questões...';

    const batch = [];

    try {
      while (batch.length < PAGE_SIZE) {
        if (session !== activeSession) return;

        const stream = nextStream(session);

        if (!stream) break;

        while (!stream.buffer.length && !stream.done) {
          if (session !== activeSession) return;

          status.textContent =
            `Buscando ${subjects[session.subject]} no ENEM ${stream.year}...`;

          const params = new URLSearchParams({
            limit: String(FETCH_SIZE),
            offset: String(stream.offset)
          });

          const data = await apiGet(
            `/exams/${stream.year}/questions?${params}`,
            () => session === activeSession
          );

          if (session !== activeSession) return;

          const questions = extractList(
            data,
            ['questions', 'results', 'items']
          );

          const hasMore = hasNextPage(
            data,
            questions.length,
            stream.offset,
            FETCH_SIZE
          );

          stream.offset += questions.length;
          stream.done = !hasMore;

          const filtered = questions
            .filter(question => {
              return question.discipline === session.subject;
            })
            .map(question => ({
              ...question,
              year: stream.year
            }));

          stream.buffer.push(...filtered);
        }

        if (stream.buffer.length) {
          const question = stream.buffer.shift();

          const key = [
            question.year,
            question.index,
            question.language ?? ''
          ].join('-');

          if (!session.seen.has(key)) {
            session.seen.add(key);
            batch.push(question);
          }
        }
      }

      if (session !== activeSession) return;

      displayBatch(session, batch);

      const hasMore = session.streams.some(stream => {
        return stream.buffer.length > 0 || !stream.done;
      });

      more.hidden = !hasMore;

      status.textContent = batch.length
        ? ''
        : session.count
          ? 'Você chegou ao fim das questões disponíveis desta área.'
          : 'Nenhuma questão encontrada para esta área.';
    } catch (error) {
      if (session !== activeSession) return;

      displayBatch(session, batch);

      status.textContent =
        `${errorMessage(error)} ` +
        'Clique em Carregar mais para tentar novamente.';

      more.hidden = false;
    } finally {
      session.busy = false;

      if (session === activeSession) {
        more.disabled = false;
      }
    }
  }

  more.addEventListener('click', () => {
    if (activeSession) {
      loadMixedQuestions(activeSession);
    }
  });
}

if (document.body.dataset.page === 'provas') {
  setupExams();
}

if (document.body.dataset.page === 'questoes') {
  setupSubjects();
}