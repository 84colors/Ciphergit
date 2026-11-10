console.log("hey there");

(function () {
    "use strict";

    // ============================================================
    // Modal
    // ============================================================
    function initModalBasic() {
        const modalGroup = document.querySelector("[data-modal-group-status]");
        const modals = document.querySelectorAll("[data-modal-name]");
        const modalTargets = document.querySelectorAll("[data-modal-target]");
        if (!modalTargets.length) return;

        function stopVideo() {
            const videoWrapper = document.querySelector(".video");
            if (!videoWrapper) return;
            const iframe = videoWrapper.querySelector("iframe");
            // Clearing src stops playback completely (video + audio)
            if (iframe) iframe.src = "";
        }

        function closeAllModals() {
            stopVideo();
            modalTargets.forEach((t) =>
                t.setAttribute("data-modal-status", "not-active"),
            );
            modals.forEach((m) =>
                m.setAttribute("data-modal-status", "not-active"),
            );
            if (modalGroup) {
                modalGroup.setAttribute(
                    "data-modal-group-status",
                    "not-active",
                );
            }
        }

        modalTargets.forEach((modalTarget) => {
            modalTarget.addEventListener("click", function () {
                const name = this.getAttribute("data-modal-target");
                const target = document.querySelector(
                    `[data-modal-target="${name}"]`,
                );
                const modal = document.querySelector(
                    `[data-modal-name="${name}"]`,
                );
                if (target) target.setAttribute("data-modal-status", "active");
                if (modal) modal.setAttribute("data-modal-status", "active");
                if (modalGroup) {
                    modalGroup.setAttribute(
                        "data-modal-group-status",
                        "active",
                    );
                }
            });
        });

        document.querySelectorAll("[data-modal-close]").forEach((btn) => {
            btn.addEventListener("click", closeAllModals);
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeAllModals();
        });
    }

    // ============================================================
    // Init
    // ============================================================
    function init() {
        initModalBasic();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
