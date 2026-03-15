// ============================================================
// Morpheus Node Manager -- Dashboard Application
// Vanilla JS. No dependencies. Modern fetch-based API client.
// ============================================================

(function () {
  'use strict';

  // --- Constants ---
  var PROVIDER_ADDRESS = '0xa2c397849325605d8a7b08629f173540a9f1ac41';
  var REFRESH_INTERVAL_MS = 30000;
  var TOAST_DURATION_MS = 5000;

  // --- Utility ---

  function truncateHex(hex, leading, trailing) {
    if (!hex || typeof hex !== 'string') return '--';
    leading = leading || 6;
    trailing = trailing || 4;
    if (hex.length <= leading + trailing + 3) return hex;
    return hex.slice(0, leading) + '...' + hex.slice(-trailing);
  }

  function formatWei(weiStr) {
    if (!weiStr || weiStr === '0') return '0.0000';
    try {
      var str = weiStr.toString();
      if (str.length <= 18) {
        str = str.padStart(19, '0');
      }
      var whole = str.slice(0, str.length - 18) || '0';
      var frac = str.slice(str.length - 18, str.length - 14);
      frac = frac.replace(/0+$/, '') || '0000';
      frac = frac.padEnd(4, '0');
      return whole + '.' + frac;
    } catch (_e) {
      return weiStr;
    }
  }

  function extractBalanceNumber(formatted) {
    if (!formatted || formatted === '--') return '--';
    return formatted.split(' ')[0] || '--';
  }

  function weiToGwei(weiStr) {
    if (!weiStr || weiStr === '0') return '0';
    try {
      var n = BigInt(weiStr);
      var gwei = n / 1000000000n;
      var remainder = n % 1000000000n;
      if (remainder === 0n) return gwei.toLocaleString();
      var frac = remainder.toString().padStart(9, '0').replace(/0+$/, '');
      return gwei.toLocaleString() + '.' + frac;
    } catch (_e) {
      return weiStr;
    }
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Toast Notifications ---

  function showToast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toast-container');
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(function () {
      toast.classList.add('toast-out');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 200);
    }, TOAST_DURATION_MS);
  }

  // --- API Client ---

  function api(method, path, body) {
    var opts = {
      method: method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          throw new Error(data.error || 'Request failed (' + res.status + ')');
        }
        return data;
      });
    });
  }

  // --- DOM Helpers ---

  function $(id) {
    return document.getElementById(id);
  }

  function clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function removeSkeleton(el) {
    if (el) el.classList.remove('loading-skeleton');
  }

  // --- Model filter and pagination state ---
  var modelFilter = 'mine'; // 'mine' or 'all'
  var allModels = [];
  var currentPage = 1;
  var PAGE_SIZE = 15;

  // --- Render Functions ---

  function renderHealth(data) {
    var indicator = $('health-indicator');
    var statusText = $('health-status-text');
    var checksEl = $('health-checks');

    indicator.classList.remove('healthy', 'unhealthy');
    if (data.healthy) {
      indicator.classList.add('healthy');
      statusText.textContent = 'OK';
    } else {
      indicator.classList.add('unhealthy');
      statusText.textContent = 'DOWN';
    }

    var statusDot = document.querySelector('.status-dot');
    var statusLabel = document.querySelector('.status-text');
    statusDot.classList.remove('status-loading', 'status-healthy', 'status-error');
    if (data.healthy) {
      statusDot.classList.add('status-healthy');
      statusLabel.textContent = 'Connected';
    } else {
      statusDot.classList.add('status-error');
      statusLabel.textContent = 'Degraded';
    }

    var checks = [
      { label: 'Process', value: data.processAlive, type: 'bool' },
      { label: 'Blockchain', value: data.blockchainConnected, type: 'bool' },
      { label: 'Latest Block', value: data.latestBlock, type: 'number' },
      { label: 'Active Bids', value: data.activeBids, type: 'number' },
      { label: 'Active Sessions', value: data.activeSessions, type: 'number' },
    ];

    clearChildren(checksEl);
    checks.forEach(function (check) {
      var div = document.createElement('div');
      div.className = 'health-check';

      var label = document.createElement('span');
      label.className = 'check-label';
      label.textContent = check.label;

      var val = document.createElement('span');
      val.className = 'check-value';

      if (check.type === 'bool') {
        val.textContent = check.value ? 'Active' : 'Inactive';
        val.classList.add(check.value ? 'check-pass' : 'check-fail');
      } else {
        val.textContent = check.value !== undefined && check.value !== null ? check.value.toLocaleString() : '--';
      }

      div.appendChild(label);
      div.appendChild(val);
      checksEl.appendChild(div);
    });

    if (data.walletAddress) {
      $('address-text').textContent = truncateHex(data.walletAddress, 6, 4);
      $('address-copy-btn').setAttribute('data-address', data.walletAddress);
    }

    if (data.providerRegistered !== undefined) {
      var provStatus = $('provider-status');
      if (provStatus && provStatus.textContent === '--') {
        provStatus.textContent = data.providerRegistered ? 'Registered' : 'Not Registered';
        provStatus.className = 'field-value ' + (data.providerRegistered ? 'status-registered' : 'status-unregistered');
        var pf = provStatus.closest('.provider-field');
        if (pf) removeSkeleton(pf);
      }
    }
  }

  function renderBalances(data) {
    var ethEl = $('balance-eth');
    var morEl = $('balance-mor');
    var ethWeiEl = $('balance-eth-wei');
    var morWeiEl = $('balance-mor-wei');

    removeSkeleton(ethEl);
    removeSkeleton(morEl);

    ethEl.textContent = extractBalanceNumber(data.eth);
    morEl.textContent = extractBalanceNumber(data.mor);
    ethWeiEl.textContent = data.ethWei ? data.ethWei + ' wei' : '';
    morWeiEl.textContent = data.morWei ? data.morWei + ' wei' : '';
  }

  function renderProvider(data) {
    var statusEl = $('provider-status');
    var stakeEl = $('provider-stake');
    var feeEl = $('provider-fee');
    var endpointEl = $('provider-endpoint');

    document.querySelectorAll('.provider-field.loading-skeleton').forEach(removeSkeleton);

    statusEl.textContent = data.registered ? 'Registered' : 'Not Registered';
    statusEl.className = 'field-value ' + (data.registered ? 'status-registered' : 'status-unregistered');

    stakeEl.textContent = data.stake || '0';
    feeEl.textContent = data.fee !== undefined ? data.fee + ' bps' : '--';
    endpointEl.textContent = data.endpoint || 'Not set';
  }

  function renderModels(models) {
    allModels = models || [];
    currentPage = 1;
    renderFilteredModels();
  }

  function renderFilteredModels() {
    var tbody = $('models-tbody');
    var emptyEl = $('models-empty');
    var paginationEl = $('models-pagination');

    clearChildren(tbody);

    var filtered = allModels;
    if (modelFilter === 'mine') {
      filtered = allModels.filter(function (m) { return !!m.myBid; });
    }

    if (!filtered || filtered.length === 0) {
      $('models-table').style.display = 'none';
      emptyEl.classList.remove('hidden');
      paginationEl.classList.add('hidden');
      if (modelFilter === 'mine') {
        emptyEl.querySelector('.empty-text').textContent = 'No models with active bids';
        emptyEl.querySelector('.empty-hint').textContent = 'Switch to "All Models" to see the full marketplace';
      } else {
        emptyEl.querySelector('.empty-text').textContent = 'No models registered on the marketplace';
        emptyEl.querySelector('.empty-hint').textContent = 'Add a model to start serving inference requests';
      }
      return;
    }

    $('models-table').style.display = '';
    emptyEl.classList.add('hidden');

    var totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    if (currentPage > totalPages) currentPage = totalPages;
    var start = (currentPage - 1) * PAGE_SIZE;
    var pageModels = filtered.slice(start, start + PAGE_SIZE);

    pageModels.forEach(function (model) {
      var tr = document.createElement('tr');

      var tdName = document.createElement('td');
      tdName.innerHTML = '<strong>' + escapeHtml(model.name || 'Unnamed') + '</strong>';
      tr.appendChild(tdName);

      var tdId = document.createElement('td');
      tdId.innerHTML = '<span class="truncate-id" title="' + escapeHtml(model.id) + '">' + escapeHtml(truncateHex(model.id, 8, 6)) + '</span>';
      tr.appendChild(tdId);

      var tdPrice = document.createElement('td');
      tdPrice.innerHTML = '<span class="mono">' + escapeHtml(weiToGwei(model.pricePerSecondWei)) + '</span> <span class="wei-label">gwei/s</span>';
      tr.appendChild(tdPrice);

      var tdStake = document.createElement('td');
      tdStake.innerHTML = '<span class="mono">' + escapeHtml(model.stake) + '</span>';
      tr.appendChild(tdStake);

      var tdBids = document.createElement('td');
      tdBids.textContent = model.activeBids !== undefined ? model.activeBids : '--';
      tr.appendChild(tdBids);

      var tdMyBid = document.createElement('td');
      if (model.myBid) {
        tdMyBid.innerHTML = '<span class="bid-price-display">' + escapeHtml(weiToGwei(model.myBid.pricePerSecondWei)) + '</span> <span class="wei-label">gwei/s</span>';
      } else {
        tdMyBid.innerHTML = '<span class="tag tag-neutral">No bid</span>';
      }
      tr.appendChild(tdMyBid);

      var tdActions = document.createElement('td');
      tdActions.className = 'td-actions';

      if (model.myBid) {
        var adjustBtn = document.createElement('button');
        adjustBtn.className = 'btn btn-secondary btn-sm';
        adjustBtn.textContent = 'Adjust';
        adjustBtn.setAttribute('data-model-id', model.id);
        adjustBtn.setAttribute('data-bid-price', model.myBid.pricePerSecondWei);
        adjustBtn.addEventListener('click', openBidModal);
        tdActions.appendChild(adjustBtn);
      }

      var removeBtn = document.createElement('button');
      removeBtn.className = 'btn btn-ghost btn-sm';
      removeBtn.textContent = 'Remove';
      removeBtn.style.color = 'var(--error)';
      removeBtn.setAttribute('data-model-id', model.id);
      removeBtn.addEventListener('click', openRemoveModal);
      tdActions.appendChild(removeBtn);

      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });

    // Pagination
    if (totalPages > 1) {
      paginationEl.classList.remove('hidden');
      $('pagination-info').textContent = filtered.length + ' models';
      $('pagination-page').textContent = currentPage + ' / ' + totalPages;
      $('page-prev').disabled = currentPage <= 1;
      $('page-next').disabled = currentPage >= totalPages;
    } else {
      paginationEl.classList.remove('hidden');
      $('pagination-info').textContent = filtered.length + ' model' + (filtered.length === 1 ? '' : 's');
      $('pagination-page').textContent = '';
      $('page-prev').disabled = true;
      $('page-next').disabled = true;
    }
  }

  function renderEarnings(data) {
    var tbody = $('earnings-tbody');
    var emptyEl = $('earnings-empty');
    var totalEl = $('earnings-total-value');
    var claimBtn = $('claim-all-btn');

    clearChildren(tbody);
    removeSkeleton(totalEl);

    if (!data || data.length === 0) {
      $('earnings-table').style.display = 'none';
      emptyEl.classList.remove('hidden');
      totalEl.textContent = '0.0000 MOR';
      claimBtn.disabled = true;
      return;
    }

    $('earnings-table').style.display = '';
    emptyEl.classList.add('hidden');

    var totalWei = BigInt(0);
    var hasClaimable = false;

    data.forEach(function (session) {
      var tr = document.createElement('tr');

      var tdId = document.createElement('td');
      tdId.innerHTML = '<span class="truncate-id" title="' + escapeHtml(session.sessionId) + '">' + escapeHtml(truncateHex(session.sessionId, 8, 6)) + '</span>';
      tr.appendChild(tdId);

      var tdClaimable = document.createElement('td');
      tdClaimable.innerHTML = '<span class="mono">' + escapeHtml(session.claimableFormatted || formatWei(session.claimableWei) + ' MOR') + '</span>';
      tr.appendChild(tdClaimable);

      var tdStatus = document.createElement('td');
      if (session.txHash) {
        tdStatus.innerHTML = '<span class="tag tag-success">Claimed</span>';
      } else if (session.skipped) {
        tdStatus.innerHTML = '<span class="tag tag-neutral">' + escapeHtml(session.skipped) + '</span>';
      } else {
        try {
          var claimableVal = BigInt(session.claimableWei || '0');
          if (claimableVal > 0n) {
            tdStatus.innerHTML = '<span class="tag tag-info">Claimable</span>';
            hasClaimable = true;
            totalWei += claimableVal;
          } else {
            tdStatus.innerHTML = '<span class="tag tag-neutral">0</span>';
          }
        } catch (_e) {
          tdStatus.innerHTML = '<span class="tag tag-neutral">--</span>';
        }
      }
      tr.appendChild(tdStatus);

      tbody.appendChild(tr);
    });

    totalEl.textContent = formatWei(totalWei.toString()) + ' MOR';
    claimBtn.disabled = !hasClaimable;
  }

  // --- Modal Handlers ---

  var currentBidModelId = null;

  function openBidModal(e) {
    var modelId = e.currentTarget.getAttribute('data-model-id');
    var currentPrice = e.currentTarget.getAttribute('data-bid-price');
    currentBidModelId = modelId;

    $('bid-modal-model-id').textContent = truncateHex(modelId, 10, 8);
    $('bid-modal-current-price').textContent = currentPrice || '--';
    $('bid-new-price').value = '';
    $('bid-modal-overlay').classList.remove('hidden');
    $('bid-new-price').focus();
  }

  function closeBidModal() {
    $('bid-modal-overlay').classList.add('hidden');
    currentBidModelId = null;
  }

  function submitBidAdjust() {
    var newPrice = $('bid-new-price').value.trim();
    if (!newPrice || !/^\d+$/.test(newPrice)) {
      showToast('Price must be a positive integer in wei', 'error');
      return;
    }
    if (!currentBidModelId) return;

    var btn = $('bid-submit');
    btn.disabled = true;
    btn.textContent = 'Updating...';

    api('POST', '/api/bids/adjust', {
      modelId: currentBidModelId,
      newPricePerSecondWei: newPrice,
    })
      .then(function () {
        showToast('Bid price updated', 'success');
        closeBidModal();
        fetchModels();
      })
      .catch(function (err) {
        showToast('Failed to adjust bid: ' + err.message, 'error');
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = 'Update Price';
      });
  }

  var currentRemoveModelId = null;

  function openRemoveModal(e) {
    var modelId = e.currentTarget.getAttribute('data-model-id');
    currentRemoveModelId = modelId;
    var confirmCode = 'DELETE_MODEL_' + modelId.slice(0, 8);

    $('remove-modal-model-id').textContent = truncateHex(modelId, 12, 8);
    $('remove-confirm-code').textContent = confirmCode;
    $('remove-confirm').value = '';
    $('remove-submit').disabled = true;
    $('remove-modal-overlay').classList.remove('hidden');
    $('remove-confirm').focus();
  }

  function closeRemoveModal() {
    $('remove-modal-overlay').classList.add('hidden');
    currentRemoveModelId = null;
  }

  function submitRemove() {
    var confirmVal = $('remove-confirm').value.trim();
    if (!currentRemoveModelId) return;

    var btn = $('remove-submit');
    btn.disabled = true;
    btn.textContent = 'Removing...';

    api('DELETE', '/api/models/' + encodeURIComponent(currentRemoveModelId), {
      confirm: confirmVal,
    })
      .then(function (result) {
        showToast('Model removed (' + result.bidsRemoved + ' bids cleaned up)', 'success');
        closeRemoveModal();
        fetchModels();
      })
      .catch(function (err) {
        showToast('Failed to remove model: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Remove Model';
      });
  }

  // --- Form: Add Model ---

  var addFormVisible = false;

  function toggleAddModelForm() {
    addFormVisible = !addFormVisible;
    var form = $('add-model-form');
    var btn = $('toggle-add-model');
    if (addFormVisible) {
      form.classList.remove('collapsed');
      btn.textContent = 'Cancel';
    } else {
      form.classList.add('collapsed');
      btn.textContent = 'Add Model';
    }
  }

  function submitAddModel() {
    var apiType = $('model-api-type').value;
    var name = $('model-name').value.trim();
    var ipfsCID = $('model-ipfs-cid').value.trim();
    var apiUrl = $('model-api-url').value.trim();
    var apiKey = $('model-api-key').value.trim();
    var stakeWei = $('model-stake-wei').value.trim();
    var priceWei = $('model-price-wei').value.trim();

    var missing = [];
    if (!name) missing.push('Model Name');
    if (!ipfsCID) missing.push('IPFS CID');
    if (!apiUrl) missing.push('API URL');
    if (!apiKey) missing.push('API Key');
    if (!stakeWei) missing.push('Stake');
    if (!priceWei) missing.push('Price/sec');

    if (missing.length > 0) {
      showToast('Missing required fields: ' + missing.join(', '), 'error');
      return;
    }

    if (!/^\d+$/.test(stakeWei)) {
      showToast('Stake must be a non-negative integer in wei', 'error');
      return;
    }
    if (!/^\d+$/.test(priceWei)) {
      showToast('Price must be a non-negative integer in wei', 'error');
      return;
    }

    var btn = $('submit-add-model');
    btn.disabled = true;
    btn.textContent = 'Registering...';

    api('POST', '/api/models', {
      name: name,
      ipfsCID: ipfsCID,
      stakeWei: stakeWei,
      pricePerSecondWei: priceWei,
      apiType: apiType,
      apiUrl: apiUrl,
      apiKey: apiKey,
      modelName: name,
    })
      .then(function (result) {
        showToast('Model registered (ID: ' + truncateHex(result.modelId, 8, 4) + ')', 'success');
        toggleAddModelForm();
        $('model-name').value = '';
        $('model-ipfs-cid').value = '';
        $('model-api-url').value = '';
        $('model-api-key').value = '';
        $('model-stake-wei').value = '';
        $('model-price-wei').value = '';
        fetchModels();
      })
      .catch(function (err) {
        showToast('Failed to add model: ' + err.message, 'error');
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = 'Register Model';
      });
  }

  // --- Claim Earnings ---

  function claimAll() {
    var btn = $('claim-all-btn');
    btn.disabled = true;
    btn.textContent = 'Claiming...';

    api('POST', '/api/earnings/claim', {})
      .then(function (data) {
        var claimed = data.filter(function (s) { return !!s.txHash; }).length;
        showToast(claimed + ' session(s) claimed', 'success');
        fetchEarnings();
      })
      .catch(function (err) {
        showToast('Failed to claim: ' + err.message, 'error');
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = 'Claim All';
      });
  }

  // --- Data Fetching ---

  function fetchStatus() {
    return api('GET', '/api/status')
      .then(renderHealth)
      .catch(function (err) {
        var statusDot = document.querySelector('.status-dot');
        var statusLabel = document.querySelector('.status-text');
        statusDot.classList.remove('status-loading', 'status-healthy');
        statusDot.classList.add('status-error');
        statusLabel.textContent = 'Error';
        console.error('Status fetch failed:', err);
      });
  }

  function fetchBalances() {
    return api('GET', '/api/balances')
      .then(renderBalances)
      .catch(function (err) {
        $('balance-eth').textContent = 'Error';
        $('balance-mor').textContent = 'Error';
        removeSkeleton($('balance-eth'));
        removeSkeleton($('balance-mor'));
        console.error('Balances fetch failed:', err);
      });
  }

  function fetchProvider() {
    return api('GET', '/api/provider')
      .then(renderProvider)
      .catch(function (err) {
        document.querySelectorAll('.provider-field.loading-skeleton').forEach(removeSkeleton);
        $('provider-status').textContent = 'Error';
        console.error('Provider fetch failed:', err);
      });
  }

  function fetchModels() {
    return api('GET', '/api/models')
      .then(renderModels)
      .catch(function (err) {
        var tbody = $('models-tbody');
        clearChildren(tbody);
        var tr = document.createElement('tr');
        var td = document.createElement('td');
        td.colSpan = 7;
        td.textContent = 'Failed to load models: ' + err.message;
        td.style.color = 'var(--error)';
        td.style.textAlign = 'center';
        td.style.padding = '24px';
        tr.appendChild(td);
        tbody.appendChild(tr);
      });
  }

  function fetchEarnings() {
    return api('GET', '/api/earnings')
      .then(renderEarnings)
      .catch(function (err) {
        $('earnings-total-value').textContent = 'Error';
        removeSkeleton($('earnings-total-value'));
        console.error('Earnings fetch failed:', err);
      });
  }

  // --- Initialization ---

  function init() {
    $('address-text').textContent = truncateHex(PROVIDER_ADDRESS, 6, 4);
    $('address-copy-btn').setAttribute('data-address', PROVIDER_ADDRESS);

    $('address-copy-btn').addEventListener('click', function () {
      var addr = this.getAttribute('data-address') || PROVIDER_ADDRESS;
      navigator.clipboard.writeText(addr).then(function () {
        showToast('Address copied to clipboard', 'info');
      }).catch(function () {
        showToast(addr, 'info');
      });
    });

    // Filter toggle
    var filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        modelFilter = btn.getAttribute('data-filter');
        currentPage = 1;
        renderFilteredModels();
      });
    });

    // Pagination
    $('page-prev').addEventListener('click', function () {
      if (currentPage > 1) { currentPage--; renderFilteredModels(); }
    });
    $('page-next').addEventListener('click', function () {
      var filtered = modelFilter === 'mine' ? allModels.filter(function (m) { return !!m.myBid; }) : allModels;
      var totalPages = Math.ceil(filtered.length / PAGE_SIZE);
      if (currentPage < totalPages) { currentPage++; renderFilteredModels(); }
    });

    $('toggle-add-model').addEventListener('click', toggleAddModelForm);
    $('cancel-add-model').addEventListener('click', toggleAddModelForm);
    $('submit-add-model').addEventListener('click', submitAddModel);

    $('bid-modal-close').addEventListener('click', closeBidModal);
    $('bid-cancel').addEventListener('click', closeBidModal);
    $('bid-submit').addEventListener('click', submitBidAdjust);
    $('bid-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeBidModal();
    });
    $('bid-new-price').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitBidAdjust();
      if (e.key === 'Escape') closeBidModal();
    });

    $('remove-modal-close').addEventListener('click', closeRemoveModal);
    $('remove-cancel').addEventListener('click', closeRemoveModal);
    $('remove-submit').addEventListener('click', submitRemove);
    $('remove-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeRemoveModal();
    });
    $('remove-confirm').addEventListener('input', function () {
      var expected = 'DELETE_MODEL_' + (currentRemoveModelId || '').slice(0, 8);
      $('remove-submit').disabled = this.value.trim() !== expected;
    });
    $('remove-confirm').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !$('remove-submit').disabled) submitRemove();
      if (e.key === 'Escape') closeRemoveModal();
    });

    $('claim-all-btn').addEventListener('click', claimAll);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeBidModal();
        closeRemoveModal();
      }
    });

    Promise.all([
      fetchStatus(),
      fetchBalances(),
      fetchProvider(),
      fetchModels(),
      fetchEarnings(),
    ]).then(function () {
      showToast('Dashboard loaded', 'success');
    });

    setInterval(function () {
      fetchStatus();
      fetchBalances();
    }, REFRESH_INTERVAL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
