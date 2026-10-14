/**
 * Hjálp — the whole panel explained in the words of somebody who does not know
 * what a branch is.
 *
 * Written for a person whose job is the policy document, not git. Every
 * paragraph names what happens on GitHub, because the panel is a thin skin over
 * it and pretending otherwise is what makes people afraid to press the button.
 */
import { el, append, clear, externalLink } from '../ui/dom.js';
import { ROLE_LABEL_IS, ROLE_DESCRIPTION_IS } from '../storage/github-client.js';

export function renderHjalp(root, { state, onNavigate }) {
  clear(root);
  const { config, identity } = state;

  append(root, [
    el('h1', { text: 'Hjálp' }),
    el('p', { class: 'lead', text: 'Stutt yfirlit yfir hvernig stjórnborðið vinnur, hvað hver hluti gerir og hvað á að gera þegar eitthvað fer úrskeiðis.' }),

    el('nav', { class: 'help-toc', 'aria-label': 'Innihald' }, [
      el('ul', {}, [
        ['vinnuferli', 'Vinnuferlið í þremur skrefum'],
        ['hlutar', 'Hlutar stjórnborðsins'],
        ['adgangur', 'Aðgangur og aðgangslyklar'],
        ['villur', 'Þegar eitthvað fer úrskeiðis'],
        ['hvad-er-opid', 'Hvað er opið og hvað er varanlegt'],
        ['takkar', 'Lyklaborðið'],
      ].map(([id, label]) => el('li', {}, [
        el('a', { href: `#${id}`, text: label }),
      ]))),
    ]),

    workflowSection(),
    partsSection(),
    accessSection(),
    troubleSection(),
    opennessSection(),
    keyboardSection(),
    contactSection(),
  ]);

  function workflowSection() {
    return el('section', { class: 'card', id: 'vinnuferli' }, [
      el('h2', { text: 'Vinnuferlið í þremur skrefum' }),
      el('ol', { class: 'help-steps' }, [
        el('li', {}, [
          el('strong', { text: 'Skrifa.' }),
          el('p', { text: 'Í Ritstjóra breytir þú skjalinu. Það sem þú skrifar er vistað í vafranum þínum jafnóðum, '
            + 'svo lokaður flipi tapar engu, og þú vistar það svo í þín eigin drög á GitHub. Drögin eru aðskilin '
            + 'frá því sem er í loftinu — enginn gestur á vefnum sér þau.' }),
        ]),
        el('li', {}, [
          el('strong', { text: 'Gefa út.' }),
          el('p', { text: 'Í Útgáfu sendir þú drögin áfram sem breytingabeiðni. Þá fer sjálfvirk skoðun í gang sem '
            + 'les skjalið yfir: vantar titil, er hlekkur bilaður, er eitthvað tvítekið. Hún tekur um mínútu.' }),
        ]),
        el('li', {}, [
          el('strong', { text: 'Sameina.' }),
          el('p', {}, [
            'Þegar skoðunin er græn má sameina beiðnina. Vefurinn byggir sig þá upp á nýtt og breytingin er í '
            + 'loftinu eftir fáar mínútur — ',
            externalLink(config.siteUrl, 'skoðaðu hana hér'),
            '. Fyrstu mínúturnar getur gamla útgáfan enn birst vegna skyndiminnis.',
          ]),
        ]),
      ]),
      el('p', { class: 'hint', text: 'Ekkert í þessu ferli er óafturkræft. Hver útgáfa er geymd og í Sögu má setja '
        + 'eldri útgáfu aftur í drögin með einum hnappi.' }),
    ]);
  }

  function partsSection() {
    const parts = [
      ['Yfirlit', 'Hvað er í loftinu, hvort þú eigir ógefin drög, og hvort eitthvað krefjist athygli.'],
      ['Ritstjóri', 'Þar sem skjalið er skrifað. Forskoðun til vinstri, tré yfir innihaldið í miðju, reitir til hægri.'],
      ['Útgáfa', 'Sendir drögin áfram, sýnir skoðunina og sameinar þegar hún er græn.'],
      ['Saga', 'Hver útgáfa skjalsins, hvað breyttist og möguleiki á að setja eldri útgáfu aftur í drögin.'],
      ['Hlekkir', 'Niðurstöður vikulegrar hlekkjaskoðunar: hvað svarar, hvað hefur flutt sig og hvað er horfið.'],
      ['Aðgerðir', 'Hver gerði hvað og hvenær. Lesið úr GitHub og ekki hægt að breyta.'],
      ['Aðgangur', 'Hverjir hafa aðgang og hvaða heimildir aðgangslykillinn þinn gefur.'],
      ['Stillingar', 'Litir ritsins, birtuskil þeirra og kóðinn til að fella ritið inn á aðra vefsíðu.'],
    ];

    return el('section', { class: 'card', id: 'hlutar' }, [
      el('h2', { text: 'Hlutar stjórnborðsins' }),
      el('dl', { class: 'help-parts' }, parts.flatMap(([name, what]) => [
        el('dt', { text: name }),
        el('dd', { text: what }),
      ])),
    ]);
  }

  function accessSection() {
    return el('section', { class: 'card', id: 'adgangur' }, [
      el('h2', { text: 'Aðgangur og aðgangslyklar' }),
      el('p', {}, [
        'Þú ert skráður inn sem ',
        el('strong', { text: identity.login }),
        ' með heimildina ',
        el('strong', { text: ROLE_LABEL_IS[identity.role] }),
        `: ${ROLE_DESCRIPTION_IS[identity.role]}`,
      ]),
      el('h3', { text: 'Hvar lykillinn er geymdur' }),
      el('p', { text: 'Aðgangslykillinn er aðeins í minni vafrans. Merkir þú við „Muna á þessu tæki“ er hann '
        + 'geymdur þar til flipinn lokast — aldrei lengur og aldrei á disk. Hann er eingöngu sendur til '
        + 'api.github.com og hvergi annað.' }),
      el('h3', { text: 'Þegar lykillinn rennur út' }),
      el('p', {}, [
        'Lyklar gilda í mest 90 daga. Þegar þinn hættir að virka birtist beiðni um innskráningu aftur; '
        + 'búðu þá til nýjan á ',
        externalLink('https://github.com/settings/personal-access-tokens/new', 'GitHub-stillingasíðunni'),
        ' með sömu heimildum og áður. Leiðbeiningar um hvaða heimildir það eru fylgja innskráningarsíðunni.',
      ]),
      el('p', { class: 'hint', text: 'Það sem þú hefur skrifað tapast ekki þó lykillinn renni út á meðan — '
        + 'það er geymt í vafranum og bíður þín þegar þú kemur inn aftur.' }),
    ]);
  }

  function troubleSection() {
    const problems = [
      {
        q: 'Skoðunin er rauð og ég skil ekki af hverju.',
        a: 'Í Útgáfu stendur hver villa á íslensku og hvar hún er í skjalinu. Hver lína er hlekkur beint á '
          + 'reitinn sem þarf að laga. Lagaðu, vistaðu og skoðunin fer sjálfkrafa í gang aftur.',
      },
      {
        q: 'Það stendur að einhver annar hafi breytt skjalinu.',
        a: 'Þá opnast listi yfir hverja breytingu sem stangast á, með þínu gildi og þeirra hlið við hlið. Þú '
          + 'velur hvor á að halda, lína fyrir línu. Hvorugt er valið fyrir þig og engu er fleygt.',
      },
      {
        q: 'Hlekkur er merktur bilaður en virkar hjá mér.',
        a: 'Vefþjónar svara vélum öðruvísi en vöfrum. Merkingin „bilaður“ er aðeins notuð þegar þjónninn segir '
          + 'skýrt að skjalið sé horfið. Svari hann ekki, eða hægt, stendur „óvíst“ — það er ekki villa.',
      },
      {
        q: 'Breytingin er sameinuð en vefurinn sýnir enn gamla útgáfu.',
        a: 'Vefurinn er byggður upp eftir sameiningu og skyndiminni GitHub Pages heldur gömlu útgáfunni í um tíu '
          + 'mínútur. Hlaðið síðunni aftur með Ctrl+Shift+R eftir þann tíma áður en þið leitið annarra skýringa.',
      },
      {
        q: 'Það stendur að ég hafi fullnýtt kvótann.',
        a: 'GitHub leyfir 5000 fyrirspurnir á klukkustund. Stjórnborðið segir þér hvenær þú kemst að aftur. '
          + 'Það sem þú hefur skrifað bíður á meðan.',
      },
    ];

    return el('section', { class: 'card', id: 'villur' }, [
      el('h2', { text: 'Þegar eitthvað fer úrskeiðis' }),
      el('div', { class: 'help-faq' }, problems.map(({ q, a }) => el('details', {}, [
        el('summary', { text: q }),
        el('p', { text: a }),
      ]))),
      el('p', { class: 'hint' }, [
        'Ef ekkert af þessu passar: ',
        externalLink(`${config.repoUrl}/issues/new`, 'skrifaðu mál á GitHub'),
        ' og lýstu því sem þú gerðir, hverju þú áttir von á og hvað gerðist í staðinn.',
      ]),
    ]);
  }

  function opennessSection() {
    return el('section', { class: 'card', id: 'hvad-er-opid' }, [
      el('h2', { text: 'Hvað er opið og hvað er varanlegt' }),
      el('div', { class: 'banner banner--info', role: 'note' }, [
        el('div', { class: 'banner-body' }, [
          el('strong', { text: 'Geymslan er opin.' }),
          el('span', { text: 'Drögin þín, breytingabeiðnir og athugasemdir eru læsileg öllum á internetinu '
            + 'áður en þau eru gefin út. Skrifaðu því ekkert í drög sem má ekki birtast.' }),
        ]),
      ]),
      el('div', { class: 'banner banner--info', role: 'note' }, [
        el('div', { class: 'banner-body' }, [
          el('strong', { text: 'Sagan er varanleg.' }),
          el('span', { text: 'Git geymir hverja útgáfu ásamt nafni og netfangi þess sem breytti. Það er kostur '
            + 'þegar rekja þarf breytingu, og það þýðir líka að texti sem einu sinni var vistaður er áfram '
            + 'til í sögunni þótt hann sé fjarlægður úr skjalinu.' }),
        ]),
        externalLink(`${config.repoUrl}/blob/${config.defaultBranch}/docs/privacy.md`, 'docs/privacy.md', { class: 'ghost-link' }),
      ]),
      el('p', { class: 'hint', text: 'Vilt þú ekki að netfangið þitt fylgi breytingum skaltu kveikja á '
        + '„Keep my email addresses private“ í GitHub-stillingum áður en þú vistar fyrstu drögin.' }),
    ]);
  }

  function keyboardSection() {
    const keys = [
      ['Ctrl + Z', 'Taka til baka í Ritstjóra'],
      ['Ctrl + Shift + Z', 'Gera aftur'],
      ['Tab', 'Næsti reitur eða hnappur'],
      ['Enter', 'Virkja hnappinn sem er í fókus'],
      ['Esc', 'Loka samanburði eða svarglugga'],
    ];

    return el('section', { class: 'card', id: 'takkar' }, [
      el('h2', { text: 'Lyklaborðið' }),
      el('p', { class: 'hint', text: 'Allt stjórnborðið er nothæft án músar. Fyrsti hnappur á hverri síðu hleypir '
        + 'þér beint í efnið.' }),
      el('table', { class: 'help-keys' }, [
        el('tbody', {}, keys.map(([key, what]) => el('tr', {}, [
          el('th', { scope: 'row' }, [el('kbd', { text: key })]),
          el('td', { text: what }),
        ]))),
      ]),
    ]);
  }

  function contactSection() {
    return el('section', { class: 'card' }, [
      el('h2', { text: 'Annað' }),
      el('ul', { class: 'help-links' }, [
        el('li', {}, [externalLink(`${config.repoUrl}/blob/${config.defaultBranch}/docs/runbook.md`, 'Handbók: hvað gera þegar vefurinn liggur niðri')]),
        el('li', {}, [externalLink(`${config.repoUrl}/blob/${config.defaultBranch}/docs/embedding.md`, 'Að fella ritið inn á aðra vefsíðu')]),
        el('li', {}, [externalLink(`${config.repoUrl}/blob/${config.defaultBranch}/docs/setup-github.md`, 'Uppsetning á GitHub (fyrir umsjónarmenn)')]),
        el('li', {}, [externalLink(`${config.repoUrl}/blob/${config.defaultBranch}/SECURITY.md`, 'Að tilkynna öryggisbrest')]),
      ]),
      el('p', {}, [
        el('button', { class: 'button-link', text: 'Fara í Yfirlit', on: { click: () => onNavigate('yfirlit') } }),
      ]),
    ]);
  }
}
