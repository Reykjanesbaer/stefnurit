/**
 * The first screen: how to get a token, and where to type it.
 *
 * The instructions are long on purpose. The people using this create a
 * fine-grained token perhaps once a quarter, and getting the scopes wrong
 * produces a 404 that reads like the repository does not exist.
 */
import { el, append, clear, externalLink, field, announce } from '../ui/dom.js';
import { tokenStore } from '../state.js';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

export function renderLogin(root, { config, onSubmit, error }) {
  clear(root);

  const tokenInput = el('input', {
    type: 'password', id: 'token', name: 'token', autocomplete: 'off',
    spellcheck: false, required: true, 'aria-describedby': 'token-hint',
    placeholder: 'github_pat_…',
  });

  const remember = el('input', { type: 'checkbox', id: 'remember' });

  const errorBox = el('p', {
    class: 'error-box', role: 'alert', id: 'login-error',
    hidden: !error, text: error ?? '',
  });

  const submit = el('button', { type: 'submit', class: 'primary', text: 'Skrá inn' });

  const form = el('form', {
    class: 'login-form', novalidate: true,
    on: {
      submit: async (event) => {
        event.preventDefault();
        const token = tokenInput.value.trim();
        if (!token) {
          errorBox.textContent = 'Límdu inn aðgangslykil til að halda áfram.';
          errorBox.hidden = false;
          tokenInput.focus();
          return;
        }
        submit.disabled = true;
        submit.textContent = 'Skrái inn…';
        errorBox.hidden = true;
        try {
          await onSubmit(token, { remember: remember.checked });
        } catch (failure) {
          errorBox.textContent = failure.message;
          errorBox.hidden = false;
          announce(failure.message, 'assertive');
          tokenInput.focus();
          tokenInput.select();
        } finally {
          submit.disabled = false;
          submit.textContent = 'Skrá inn';
        }
      },
    },
  }, [
    field('token', 'Aðgangslykill (fine-grained personal access token)', tokenInput,
      'Lykillinn er aðeins geymdur í minni vafrans og sendur eingöngu á api.github.com.'),
    el('div', { class: 'checkbox-row' }, [
      remember,
      el('label', { for: 'remember', text: 'Muna á þessu tæki þar til flipanum er lokað' }),
    ]),
    el('p', { class: 'hint', text: 'Ekki haka við þetta á tölvu sem fleiri nota.' }),
    errorBox,
    submit,
  ]);

  append(root, [
    el('div', { class: 'login' }, [
      el('header', { class: 'login-head' }, [
        el('h1', { text: 'Stjórnborð stefnurits' }),
        el('p', { class: 'lead', text: 'Hér breytir þú hlekkjum í stefnuriti Reykjanesbæjar og birtir breytingarnar.' }),
      ]),

      el('section', { class: 'card', 'aria-labelledby': 'howto' }, [
        el('h2', { id: 'howto', text: 'Fyrst þarftu aðgangslykil' }),
        el('p', { text: 'Lykillinn segir GitHub að þú megir breyta þessari einu geymslu. Hann er búinn til hjá GitHub, ekki hér.' }),
        el('ol', { class: 'steps' }, [
          el('li', {}, [
            externalLink(TOKEN_URL, 'Opna GitHub til að búa til token', { class: 'button-link' }),
          ]),
          el('li', {}, ['Undir ', el('strong', { text: 'Repository access' }), ' velurðu ',
            el('strong', { text: 'Only select repositories' }), ' og þar ',
            el('code', { text: `${config.owner}/${config.repo}` }), '.']),
          el('li', {}, ['Undir ', el('strong', { text: 'Permissions → Repository permissions' }), ' stillirðu:',
            el('ul', { class: 'perms' }, [
              el('li', {}, [el('code', { text: 'Contents' }), ' → ', el('strong', { text: 'Read and write' }),
                ' — til að vista drög']),
              el('li', {}, [el('code', { text: 'Pull requests' }), ' → ', el('strong', { text: 'Read and write' }),
                ' — til að birta']),
              el('li', {}, [el('code', { text: 'Metadata' }), ' → ', el('strong', { text: 'Read-only' }),
                ' — veljist sjálfkrafa']),
              el('li', {}, [el('code', { text: 'Actions' }), ' → ', el('strong', { text: 'Read and write' }),
                ' — valfrjálst, fyrir „Athuga núna“ hnappinn']),
            ])]),
          el('li', {}, ['Undir ', el('strong', { text: 'Expiration' }), ' velurðu mest ',
            el('strong', { text: '90 daga' }), '. Þú býrð einfaldlega til nýjan þegar hann rennur út.']),
          el('li', { text: 'Smelltu á „Generate token“, afritaðu lykilinn og límdu hann hér að neðan. GitHub sýnir hann aðeins einu sinni.' }),
        ]),
      ]),

      el('section', { class: 'card' }, [
        el('h2', { text: 'Skrá inn' }),
        form,
      ]),

      el('section', { class: 'card notice' }, [
        el('h2', { text: 'Tvennt sem er gott að vita' }),
        el('ul', {}, [
          el('li', {}, [el('strong', { text: 'Geymslan er opinber. ' }),
            'Drög og breytingabeiðnir eru sýnileg öllum á netinu áður en þú birtir þær. ',
            'Ekki setja neitt í drög sem má ekki sjást.']),
          el('li', {}, [el('strong', { text: 'Sagan er varanleg. ' }),
            'Git geymir allar útgáfur að eilífu, ásamt nafni þess sem breytti. ',
            'Það er kostur þegar þarf að rekja breytingu, en það þýðir líka að ekkert hverfur alveg.']),
        ]),
      ]),
    ]),
  ]);

  if (tokenStore.isRemembered) remember.checked = true;
  tokenInput.focus();
}
