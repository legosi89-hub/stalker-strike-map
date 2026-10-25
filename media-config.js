'use strict';

// Galleries are presentation metadata; atlas indexes never change map coordinates.
(() => {
  const archiveAtlas = './assets/anomalies/field-contact-sheet.png';
  const surveyAtlas = './assets/anomalies/survey-contact-sheet.png';
  const original = file => ({src: `./assets/anomalies/${file}.png`, damage: 'none'});
  const archive = (index, damage, warning) => ({atlas: archiveAtlas, index, columns: 4, rows: 4, damage, warning});
  const survey = (index, damage = 'none', warning) => ({atlas: surveyAtlas, index, columns: 3, rows: 2, damage, ...(warning ? {warning} : {})});

  const galleries = {
    'anomaly-glass': [
      original('glass'),
      archive(0, 'heavy', 'yellow'),
      archive(1, 'heavy', 'yellow')
    ],
    'anomaly-ember': [
      original('ember'),
      archive(3, 'mild', 'yellow'),
      archive(2, 'lost', 'red')
    ],
    'anomaly-silence': [
      original('silence'),
      archive(4, 'heavy', 'yellow'),
      archive(5, 'heavy', 'yellow')
    ],
    'anomaly-echo': [
      original('echo'),
      archive(7, 'lost', 'red'),
      archive(6, 'heavy', 'yellow')
    ],
    'anomaly-red-thread': [
      original('red-thread'),
      {...archive(9, 'mild', 'yellow'), intensity: 'plus'},
      archive(8, 'lost', 'red')
    ],
    'anomaly-6': [
      original('closed-house'),
      archive(10, 'heavy', 'yellow'),
      archive(11, 'heavy', 'yellow')
    ],
    'anomaly-7': [
      original('lonely-man'),
      {...archive(12, 'heavy', 'red'), intensity: 'max'},
      archive(13, 'heavy', 'red')
    ],
    'anomaly-8': [
      original('knocking'),
      archive(14, 'heavy', 'yellow'),
      archive(15, 'lost', 'red')
    ],
    'point-8': [
      survey(0, 'aged'), // Recovered low-light field image.
      survey(1, 'medium'), // Glow; no damage warning label.
      survey(2, 'heavy', 'red') // Empty camp.
    ],
    'point-9': [
      survey(3, 'aged'), // Recovered field image, still readable.
      survey(4, 'aged'),
      survey(5, 'heavy', 'yellow')
    ]
  };

  const sketches = {};
  for (let index = 0; index < 9; index++) {
    sketches[`point-${index + 1}`] = {
      atlas: './assets/anomalies/place-sketches.png', index, columns: 3, rows: 3
    };
  }
  const anomalyIds = ['anomaly-glass', 'anomaly-ember', 'anomaly-silence', 'anomaly-echo', 'anomaly-red-thread', 'anomaly-6', 'anomaly-7', 'anomaly-8'];
  anomalyIds.forEach((id, index) => {
    sketches[id] = {atlas: './assets/anomalies/sketches.png', index, columns: 4, rows: 2};
  });

  window.MAP_MEDIA = {galleries, sketches};
})();
