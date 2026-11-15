// Interview preparation flip cards (/account/interview-prep, components/prep/FlipCards). Registered with
// registerCopy(pagesPrepFlip); merged into the `prep` namespace of pagesPrep.
const az = {
  prep: {
    flip: {
      start: 'Kartlar',
      title: 'Kartlarla məşq',
      intro: 'Ön tərəfdə sual, arxada nümunə cavab. Kartı çevirin, cavabı yüksək səslə deyin, sonra qiymətləndirin.',
      front: 'Sual',
      back: 'Nümunə cavab',
      flip: 'Çevir',
      flipHint: 'Kartı çevirmək üçün toxunun (və ya boşluq düyməsi)',
      prev: 'Əvvəlki',
      next: 'Növbəti',
      position: '{{n}} / {{total}}',
      knew: 'Bilirdim',
      again: 'Yenə məşq et',
      markedKnew: 'Bilirdim kimi qeyd olunub',
      markedAgain: 'Təkrar üçün qeyd olunub',
      onlyAgain: 'Yalnız «yenə məşq et» kartları',
      counts: '{{knew}} bilirdim · {{again}} təkrar',
      resetMarks: 'Qeydləri sıfırla',
      empty: 'Təkrar üçün kart yoxdur — əla!',
      keys: '← → kartlar arasında, boşluq — çevir',
      swipe: 'Kartları sürüşdürərək dəyişin',
      close: 'Bağla',
    },
  },
};

const de: typeof az = {
  prep: {
    flip: {
      start: 'Karteikarten',
      title: 'Mit Karteikarten üben',
      intro: 'Vorne die Frage, hinten die Musterantwort. Karte umdrehen, laut antworten, dann bewerten.',
      front: 'Frage',
      back: 'Musterantwort',
      flip: 'Umdrehen',
      flipHint: 'Tippen zum Umdrehen (oder Leertaste)',
      prev: 'Zurück',
      next: 'Weiter',
      position: '{{n}} / {{total}}',
      knew: 'Wusste ich',
      again: 'Nochmal üben',
      markedKnew: 'Als „wusste ich“ markiert',
      markedAgain: 'Zum Wiederholen markiert',
      onlyAgain: 'Nur Karten „nochmal üben“',
      counts: '{{knew}} gewusst · {{again}} nochmal',
      resetMarks: 'Markierungen zurücksetzen',
      empty: 'Keine Karten zum Wiederholen — sehr gut!',
      keys: '← → zwischen den Karten, Leertaste — umdrehen',
      swipe: 'Zum Blättern wischen',
      close: 'Schließen',
    },
  },
};

const en: typeof az = {
  prep: {
    flip: {
      start: 'Flip cards',
      title: 'Practise with flip cards',
      intro: 'Question on the front, model answer on the back. Flip the card, answer out loud, then mark it.',
      front: 'Question',
      back: 'Model answer',
      flip: 'Flip',
      flipHint: 'Tap to flip (or press space)',
      prev: 'Previous',
      next: 'Next',
      position: '{{n}} / {{total}}',
      knew: 'I knew it',
      again: 'Practise again',
      markedKnew: 'Marked as known',
      markedAgain: 'Marked to practise again',
      onlyAgain: 'Only “practise again” cards',
      counts: '{{knew}} known · {{again}} again',
      resetMarks: 'Reset marks',
      empty: 'No cards to practise again — well done!',
      keys: '← → between cards, space — flip',
      swipe: 'Swipe to change cards',
      close: 'Close',
    },
  },
};

const ru: typeof az = {
  prep: {
    flip: {
      start: 'Карточки',
      title: 'Тренировка с карточками',
      intro: 'Спереди вопрос, сзади образец ответа. Переверните карточку, ответьте вслух, затем отметьте.',
      front: 'Вопрос',
      back: 'Образец ответа',
      flip: 'Перевернуть',
      flipHint: 'Нажмите, чтобы перевернуть (или пробел)',
      prev: 'Назад',
      next: 'Дальше',
      position: '{{n}} / {{total}}',
      knew: 'Знал(а)',
      again: 'Повторить',
      markedKnew: 'Отмечено как «знал(а)»',
      markedAgain: 'Отмечено для повторения',
      onlyAgain: 'Только карточки «повторить»',
      counts: '{{knew}} знал(а) · {{again}} повторить',
      resetMarks: 'Сбросить отметки',
      empty: 'Нет карточек для повторения — отлично!',
      keys: '← → между карточками, пробел — перевернуть',
      swipe: 'Листайте свайпом',
      close: 'Закрыть',
    },
  },
};

export const pagesPrepFlip = { az, de, en, ru };
