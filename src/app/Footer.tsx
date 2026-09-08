/** @file The page footer: an attribution line and nothing else. */

export const Footer: React.FC = () => (
    <footer className="text-center text-lg py-2">
        <p>
            Copyright &copy; {new Date().getFullYear()} by{" "}
            <a
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                href="https://github.com/3li-ashraf"
            >
                Ali Ashraf
            </a>
        </p>
    </footer>
);
