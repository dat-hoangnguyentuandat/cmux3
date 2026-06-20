using System.Diagnostics;

namespace Cmux.Launcher;

/// <summary>
/// Simple interactive REPL that forwards commands to the existing "cmux" CLI.
/// Locates the cmux executable next to the launcher or builds from source.
/// </summary>
internal static class InteractiveCli
{
    internal static int Run()
    {
        var cli = ResolveCli();
        if (cli == null)
        {
            Console.Error.WriteLine("Could not find the cmux CLI (cmux.exe or Cmux.Cli project).");
            return 1;
        }

        Console.WriteLine("cmux interactive CLI. Type a command (e.g. status, workspace list).");
        Console.WriteLine("Type 'exit' or 'quit' to return to the launcher.\n");

        while (true)
        {
            Console.Write("cmux> ");
            var line = Console.ReadLine();
            if (line == null)
                break;
            line = line.Trim();
            if (line.Length == 0)
                continue;
            if (line is "exit" or "quit")
                break;

            RunOnce(cli.Value, line);
        }
        return 0;
    }

    private static void RunOnce((string file, string? project) cli, string line)
    {
        var psi = new ProcessStartInfo
        {
            UseShellExecute = false,
        };
        if (cli.project != null)
        {
            psi.FileName = "dotnet";
            psi.Arguments = $"run --project \"{cli.project}\" -- {line}";
        }
        else
        {
            psi.FileName = cli.file;
            psi.Arguments = line;
        }
        psi.Environment["CMUX_URL"] = ServerManager.Url;

        try
        {
            var proc = Process.Start(psi);
            proc?.WaitForExit();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Error: {ex.Message}");
        }
    }

    private static (string file, string? project)? ResolveCli()
    {
        var baseDir = AppContext.BaseDirectory;
        var exe = Path.Combine(baseDir, "cmux.exe");
        if (File.Exists(exe))
            return (exe, null);

        var dir = new DirectoryInfo(baseDir);
        while (dir != null)
        {
            var candidate = Path.Combine(dir.FullName, "server", "Cmux.Cli", "Cmux.Cli.csproj");
            if (File.Exists(candidate))
                return ("dotnet", candidate);
            var sibling = Path.Combine(dir.FullName, "Cmux.Cli", "Cmux.Cli.csproj");
            if (File.Exists(sibling))
                return ("dotnet", sibling);
            dir = dir.Parent;
        }
        return null;
    }
}
